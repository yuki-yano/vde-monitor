import type { AgentMonitorConfig, SessionDetail } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionRouteDeps } from "../types";
import { createLaunchRoute } from "./launch-route";

const buildPane = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "%13",
  sessionName: "dev",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: "claude",
  currentPath: "/repo",
  paneTty: "/dev/ttys001",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
  branch: "main",
  worktreePath: "/repo",
  agent: "claude",
  state: "RUNNING",
  stateReason: "running",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: true,
  pipeConflict: false,
  startCommand: "claude",
  panePid: 123,
  agentSessionId: "claude-session-1",
  ...overrides,
});

describe("createLaunchRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached response before resume pre-validation on retry", async () => {
    let getDetailCalls = 0;
    const getDetail = vi.fn(() => {
      getDetailCalls += 1;
      return getDetailCalls === 1 ? buildPane() : null;
    });
    const launchAgentInSession = vi.fn(async () => ({
      ok: true as const,
      result: {
        sessionName: "dev",
        agent: "claude" as const,
        windowId: "@2",
        windowIndex: 2,
        windowName: "claude-work",
        paneId: "%13",
        launchedCommand: "claude" as const,
        resolvedOptions: [],
        verification: {
          status: "verified" as const,
          observedCommand: "claude",
          attempts: 1,
        },
      },
      rollback: { attempted: false, ok: true },
    }));

    const app = createLaunchRoute({
      config: {
        multiplexer: { backend: "tmux" },
      } as unknown as AgentMonitorConfig,
      monitor: {
        registry: { getDetail },
      } as unknown as SessionRouteDeps["monitor"],
      actions: { launchAgentInSession } as unknown as SessionRouteDeps["actions"],
      sendLimiter: () => true,
      getLimiterKey: () => "limiter-key",
    });

    const payload = {
      sessionName: "dev",
      agent: "claude",
      requestId: "req-1",
      resumeFromPaneId: "%13",
      resumePolicy: "required",
    };
    const first = await app.request("/sessions/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const firstJson = (await first.json()) as { command: { ok: boolean } };
    expect(first.status).toBe(200);
    expect(firstJson.command.ok).toBe(true);

    const second = await app.request("/sessions/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const secondJson = (await second.json()) as { command: { ok: boolean } };
    expect(second.status).toBe(200);
    expect(secondJson.command.ok).toBe(true);
    expect(launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("attaches planner resume metadata on post-gate TMUX_UNAVAILABLE", async () => {
    const launchAgentInSession = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "TMUX_UNAVAILABLE" as const,
        message: "tmux server unavailable",
      },
      rollback: { attempted: false, ok: true },
    }));

    const app = createLaunchRoute({
      config: {
        multiplexer: { backend: "tmux" },
      } as unknown as AgentMonitorConfig,
      monitor: {
        registry: { getDetail: () => null },
      } as unknown as SessionRouteDeps["monitor"],
      actions: { launchAgentInSession } as unknown as SessionRouteDeps["actions"],
      sendLimiter: () => true,
      getLimiterKey: () => "limiter-key",
    });

    const res = await app.request("/sessions/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev",
        agent: "codex",
        requestId: "req-2",
        resumeSessionId: "manual-session-id",
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      command: {
        ok: false;
        error: { code: string };
        resume?: { failureReason?: string; source: string | null };
      };
    };
    expect(json.command.ok).toBe(false);
    expect(json.command.error.code).toBe("TMUX_UNAVAILABLE");
    expect(json.command.resume?.source).toBe("manual");
    expect(json.command.resume?.failureReason).toBeUndefined();
  });
});
