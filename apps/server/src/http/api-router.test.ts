import { type AgentMonitorConfig, defaultConfig, type SessionDetail } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCommitLog } from "../git-commits.js";
import { fetchDiffSummary } from "../git-diff.js";
import type { createSessionMonitor } from "../monitor.js";
import { createSessionRegistry } from "../session-registry.js";
import type { createTmuxActions } from "../tmux-actions.js";
import { createApiRouter } from "./api-router.js";

vi.mock("../git-diff.js", () => ({
  fetchDiffSummary: vi.fn(),
  fetchDiffFile: vi.fn(),
}));

vi.mock("../git-commits.js", () => ({
  fetchCommitLog: vi.fn(),
  fetchCommitDetail: vi.fn(),
  fetchCommitFile: vi.fn(),
}));

type Monitor = ReturnType<typeof createSessionMonitor>;
type TmuxActions = ReturnType<typeof createTmuxActions>;

const createSessionDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "pane-1",
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: "/tmp",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "codex",
  state: "RUNNING",
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
  ...overrides,
});

const createTestContext = (configOverrides: Partial<AgentMonitorConfig> = {}) => {
  const config: AgentMonitorConfig = { ...defaultConfig, token: "token", ...configOverrides };
  const registry = createSessionRegistry();
  const detail = createSessionDetail();
  registry.update(detail);
  const captureText = vi.fn(async () => ({
    screen: "hello",
    alternateOn: false,
    truncated: null,
  }));
  const monitor = {
    registry,
    getScreenCapture: () => ({ captureText }),
    setCustomTitle: vi.fn((paneId: string, title: string | null) => {
      const existing = registry.getDetail(paneId);
      if (!existing) return;
      registry.update({ ...existing, customTitle: title });
    }),
    recordInput: vi.fn(),
  } as unknown as Monitor;
  const tmuxActions = {
    sendText: vi.fn(async () => ({ ok: true })),
    sendKeys: vi.fn(async () => ({ ok: true })),
    sendRaw: vi.fn(async () => ({ ok: true })),
  } as unknown as TmuxActions;
  const api = createApiRouter({ config, monitor, tmuxActions });
  return { api, config, monitor, tmuxActions, detail };
};

const authHeaders = {
  Authorization: "Bearer token",
};

describe("createApiRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without auth", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions");
    expect(res.status).toBe(401);
  });

  it("rejects requests with disallowed origin", async () => {
    const { api } = createTestContext({ allowedOrigins: ["https://allowed.example"] });
    const res = await api.request("/sessions", {
      headers: { ...authHeaders, origin: "https://bad.example" },
    });
    expect(res.status).toBe(403);
  });

  it("returns sessions snapshot and mirrors request id", async () => {
    const { api, config } = createTestContext();
    const res = await api.request("/sessions", {
      headers: { ...authHeaders, "x-request-id": "req-1" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Request-Id")).toBe("req-1");
    const data = await res.json();
    expect(data.sessions.length).toBe(1);
    expect(data.clientConfig.screen.highlightCorrection).toEqual(config.screen.highlightCorrection);
  });

  it("returns 404 when session is missing", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/missing", { headers: authHeaders });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PANE");
  });

  it("returns rate limit error on repeated screen requests", async () => {
    const { api } = createTestContext({
      rateLimit: { ...defaultConfig.rateLimit, screen: { windowMs: 1000, max: 1 } },
    });
    const payload = JSON.stringify({ mode: "text", lines: 5 });
    const headers = { ...authHeaders, "content-type": "application/json" };
    const first = await api.request("/sessions/pane-1/screen", {
      method: "POST",
      headers,
      body: payload,
    });
    const second = await api.request("/sessions/pane-1/screen", {
      method: "POST",
      headers,
      body: payload,
    });
    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.screen.ok).toBe(true);
    expect(secondData.screen.ok).toBe(false);
    expect(secondData.screen.error.code).toBe("RATE_LIMIT");
  });

  it("returns read-only error on send text", async () => {
    const { api } = createTestContext({ readOnly: true });
    const res = await api.request("/sessions/pane-1/send/text", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: "ls", enter: true }),
    });
    const data = await res.json();
    expect(data.command.ok).toBe(false);
    expect(data.command.error.code).toBe("READ_ONLY");
  });

  it("returns 400 when diff summary is unavailable", async () => {
    vi.mocked(fetchDiffSummary).mockResolvedValueOnce({
      repoRoot: null,
      rev: null,
      generatedAt: new Date(0).toISOString(),
      files: [],
      reason: "not_git",
    });
    const { api } = createTestContext();
    const res = await api.request("/sessions/pane-1/diff/file?path=README.md", {
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when commit log is unavailable", async () => {
    vi.mocked(fetchCommitLog).mockResolvedValueOnce({
      repoRoot: null,
      rev: null,
      generatedAt: new Date(0).toISOString(),
      commits: [],
      reason: "not_git",
    });
    const { api } = createTestContext();
    const res = await api.request("/sessions/pane-1/commits/hash", {
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });
});
