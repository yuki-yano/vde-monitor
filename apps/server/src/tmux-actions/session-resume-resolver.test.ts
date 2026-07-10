import type { SessionDetail } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { resolveSessionByPane } from "./session-resume-resolver";

const buildPane = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "%1",
  sessionName: "main",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: "claude",
  currentPath: "/repo",
  paneTty: "/dev/ttys001",
  title: null,
  customTitle: null,
  repoRoot: "/repo",
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
  completion: null,
  ...overrides,
});

describe("resolveSessionByPane", () => {
  it("returns hook session id for claude pane", async () => {
    const resolved = await resolveSessionByPane({
      pane: buildPane({
        agent: "claude",
        agentSessionId: "claude-session-1",
      }),
      requestAgent: "claude",
    });

    expect(resolved).toEqual({
      ok: true,
      sessionId: "claude-session-1",
      source: "hook",
      confidence: "high",
      agent: "claude",
    });
  });

  it("returns unsupported for unknown pane agent", async () => {
    const resolved = await resolveSessionByPane({
      pane: buildPane({ agent: "unknown" }),
      requestAgent: "codex",
    });

    expect(resolved).toEqual({
      ok: false,
      reason: "unsupported",
      agent: "unknown",
    });
  });

  it("returns invalid_input when pane agent mismatches request agent", async () => {
    const resolved = await resolveSessionByPane({
      pane: buildPane({ agent: "claude" }),
      requestAgent: "codex",
    });

    expect(resolved).toEqual({
      ok: false,
      reason: "invalid_input",
      agent: "claude",
    });
  });
});
