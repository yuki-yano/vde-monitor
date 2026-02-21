import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type AgentMonitorConfig,
  defaultConfig,
  type NotificationSettings,
  type RepoNote,
  type SessionDetail,
} from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCommitDetail, fetchCommitFile, fetchCommitLog } from "../domain/git/git-commits";
import { fetchDiffSummary } from "../domain/git/git-diff";
import type { createSessionMonitor } from "../monitor";
import type { MultiplexerInputActions } from "../multiplexer/types";
import type { NotificationService } from "../notifications/service";
import { createSessionRegistry } from "../session-registry";
import { createApiRouter } from "./api-router";
import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES,
} from "./image-attachment";

vi.mock("../domain/git/git-diff", () => ({
  fetchDiffSummary: vi.fn(),
  fetchDiffFile: vi.fn(),
}));

vi.mock("../domain/git/git-commits", () => ({
  fetchCommitLog: vi.fn(),
  fetchCommitDetail: vi.fn(),
  fetchCommitFile: vi.fn(),
}));

type Monitor = ReturnType<typeof createSessionMonitor>;

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
  const getStateTimeline = vi.fn(() => ({
    paneId: detail.paneId,
    now: new Date(0).toISOString(),
    range: "1h",
    items: [],
    totalsMs: {
      RUNNING: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  }));
  const getRepoStateTimeline = vi.fn(() => ({
    paneId: detail.paneId,
    now: new Date(0).toISOString(),
    range: "1h",
    items: [],
    totalsMs: {
      RUNNING: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  }));
  const getRepoNotes = vi.fn((): RepoNote[] => []);
  const createRepoNote = vi.fn((_: string, input: { title?: string | null; body: string }) => ({
    id: "note-1",
    repoRoot: detail.repoRoot ?? "/repo",
    title: input.title ?? null,
    body: input.body,
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
  }));
  const updateRepoNote = vi.fn(
    (
      _: string,
      noteId: string,
      input: { title?: string | null; body: string },
    ): RepoNote | null => ({
      id: noteId,
      repoRoot: detail.repoRoot ?? "/repo",
      title: input.title ?? null,
      body: input.body,
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:01.000Z",
    }),
  );
  const deleteRepoNote = vi.fn(() => true);
  const monitor = {
    registry,
    getScreenCapture: () => ({ captureText }),
    getStateTimeline,
    getRepoStateTimeline,
    getRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
    setCustomTitle: vi.fn((paneId: string, title: string | null) => {
      const existing = registry.getDetail(paneId);
      if (!existing) return;
      registry.update({ ...existing, customTitle: title });
    }),
    recordInput: vi.fn(),
    markPaneViewed: vi.fn(),
  } as unknown as Monitor;
  const actions = {
    sendText: vi.fn(async () => ({ ok: true })),
    sendKeys: vi.fn(async () => ({ ok: true })),
    sendRaw: vi.fn(async () => ({ ok: true })),
    focusPane: vi.fn(async () => ({ ok: true as const })),
    killPane: vi.fn(async () => ({ ok: true as const })),
    killWindow: vi.fn(async () => ({ ok: true as const })),
    launchAgentInSession: vi.fn(async () => ({
      ok: true as const,
      result: {
        sessionName: "session",
        agent: "codex" as const,
        windowId: "@42",
        windowIndex: 1,
        windowName: "codex-work",
        paneId: "%99",
        launchedCommand: "codex" as const,
        resolvedOptions: [],
        verification: {
          status: "verified" as const,
          observedCommand: "codex",
          attempts: 1,
        },
      },
      rollback: { attempted: false, ok: true },
    })),
  } as unknown as MultiplexerInputActions;
  const settings: NotificationSettings = {
    pushEnabled: true,
    vapidPublicKey: "test-vapid",
    supportedEvents: ["pane.waiting_permission", "pane.task_completed"],
    enabledEventTypes: ["pane.waiting_permission", "pane.task_completed"],
    requireStandaloneOnIOS: true,
  };
  const notificationService = {
    getSettings: vi.fn(() => settings),
    upsertSubscription: vi.fn(() => ({
      subscriptionId: "sub-1",
      created: true,
      savedAt: "2026-02-20T00:00:00.000Z",
    })),
    removeSubscription: vi.fn(() => true),
    revokeSubscriptions: vi.fn(() => 0),
    removeAllSubscriptions: vi.fn(() => 0),
    dispatchTransition: vi.fn(async () => undefined),
    getSupportedEvents: vi.fn(() => ["pane.waiting_permission", "pane.task_completed"]),
  } as unknown as NotificationService;
  const api = createApiRouter({ config, monitor, actions, notificationService });
  return {
    api,
    config,
    monitor,
    actions,
    detail,
    getStateTimeline,
    getRepoStateTimeline,
    getRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
  };
};

const authHeaders = {
  Authorization: "Bearer token",
};

const createMultipartImagePayload = ({
  fieldName = "image",
  fileName = "sample.png",
  mimeType = "image/png",
  content = "png-data",
  boundary = "----vde-monitor-test-boundary",
}: {
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  content?: string;
  boundary?: string;
} = {}) => {
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return {
    body,
    boundary,
    byteLength: Buffer.byteLength(body),
  };
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
    const req = new Request("http://localhost/sessions", {
      headers: { ...authHeaders, Origin: "https://bad.example" },
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(403);
  });

  it("allows unauthenticated preflight requests", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions", { method: "OPTIONS" });
    expect(res.status).toBe(204);
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
    expect(data.clientConfig.fileNavigator.autoExpandMatchLimit).toBe(
      config.fileNavigator.autoExpandMatchLimit,
    );
    expect(data.clientConfig.workspaceTabs.displayMode).toBe(config.workspaceTabs.displayMode);
    expect(data.clientConfig.launch).toEqual(config.launch);
  });

  it("returns 404 when session is missing", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/missing", { headers: authHeaders });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PANE");
  });

  it("returns timeline for a pane", async () => {
    const { api, getStateTimeline } = createTestContext();
    const res = await api.request("/sessions/pane-1/timeline?range=15m&limit=50", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getStateTimeline).toHaveBeenCalledWith("pane-1", "15m", 50);
    const data = await res.json();
    expect(data.timeline.paneId).toBe("pane-1");
  });

  it("returns config validation cause when request handler throws invalid config error", async () => {
    const { api } = createTestContext();
    const cause =
      "invalid config: /tmp/.vde/monitor/config.yml activity.pollIntervalMs Invalid input: expected number, received string";
    api.get("/__test/config-validation-error", () => {
      throw new Error(cause);
    });

    const res = await api.request("/__test/config-validation-error", {
      headers: authHeaders,
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe("INTERNAL");
    expect(data.error.message).toBe("configuration validation failed");
    expect(data.errorCause).toBe(cause);
  });

  it("returns plain 500 response when request handler throws non-config error", async () => {
    const { api } = createTestContext();
    api.get("/__test/unhandled-error", () => {
      throw new Error("boom");
    });

    const res = await api.request("/__test/unhandled-error", {
      headers: authHeaders,
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal Server Error");
  });

  it("accepts extended timeline range values", async () => {
    const { api, getStateTimeline } = createTestContext();
    const res = await api.request("/sessions/pane-1/timeline?range=24h&limit=20", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getStateTimeline).toHaveBeenCalledWith("pane-1", "24h", 20);
  });

  it("forwards undefined limit when query limit is omitted", async () => {
    const { api, getStateTimeline } = createTestContext();
    const res = await api.request("/sessions/pane-1/timeline?range=3h", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getStateTimeline).toHaveBeenCalledWith("pane-1", "3h", undefined);
  });

  it("returns repo timeline when scope=repo", async () => {
    const { api, getRepoStateTimeline } = createTestContext();
    const res = await api.request("/sessions/pane-1/timeline?scope=repo&range=3h&limit=40", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getRepoStateTimeline).toHaveBeenCalledWith("pane-1", "3h", 40);
  });

  it("returns invalid payload when repo timeline is unavailable", async () => {
    const { api, getRepoStateTimeline } = createTestContext();
    getRepoStateTimeline.mockReturnValueOnce(null as never);

    const res = await api.request("/sessions/pane-1/timeline?scope=repo", {
      headers: authHeaders,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
  });

  it("lists repo notes for the pane repository", async () => {
    const { api, monitor, detail, getRepoNotes } = createTestContext();
    monitor.registry.update({
      ...detail,
      repoRoot: "/repo",
    });
    getRepoNotes.mockReturnValueOnce([
      {
        id: "note-1",
        repoRoot: "/repo",
        title: "todo",
        body: "write tests",
        createdAt: "2026-02-10T00:00:00.000Z",
        updatedAt: "2026-02-10T00:00:00.000Z",
      },
    ]);

    const res = await api.request("/sessions/pane-1/notes", { headers: authHeaders });

    expect(res.status).toBe(200);
    expect(getRepoNotes).toHaveBeenCalledWith("pane-1");
    const data = await res.json();
    expect(data.repoRoot).toBe("/repo");
    expect(data.notes).toHaveLength(1);
  });

  it("returns REPO_UNAVAILABLE for notes endpoints when pane has no repoRoot", async () => {
    const { api } = createTestContext();

    const getRes = await api.request("/sessions/pane-1/notes", { headers: authHeaders });
    expect(getRes.status).toBe(400);
    const getData = await getRes.json();
    expect(getData.error.code).toBe("REPO_UNAVAILABLE");

    const postRes = await api.request("/sessions/pane-1/notes", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "todo", body: "write tests" }),
    });
    expect(postRes.status).toBe(400);
    const postData = await postRes.json();
    expect(postData.error.code).toBe("REPO_UNAVAILABLE");
  });

  it("creates and updates repo notes", async () => {
    const { api, monitor, detail, createRepoNote, updateRepoNote } = createTestContext();
    monitor.registry.update({
      ...detail,
      repoRoot: "/repo",
    });

    const createRes = await api.request("/sessions/pane-1/notes", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "  todo  ", body: "write tests" }),
    });
    expect(createRes.status).toBe(200);
    expect(createRepoNote).toHaveBeenCalledWith("pane-1", {
      title: "todo",
      body: "write tests",
    });

    const updateRes = await api.request("/sessions/pane-1/notes/note-1", {
      method: "PUT",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "done", body: "completed" }),
    });
    expect(updateRes.status).toBe(200);
    expect(updateRepoNote).toHaveBeenCalledWith("pane-1", "note-1", {
      title: "done",
      body: "completed",
    });
  });

  it("allows empty-body repo notes for create and update", async () => {
    const { api, monitor, detail, createRepoNote, updateRepoNote } = createTestContext();
    monitor.registry.update({
      ...detail,
      repoRoot: "/repo",
    });

    const createRes = await api.request("/sessions/pane-1/notes", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });
    expect(createRes.status).toBe(200);
    expect(createRepoNote).toHaveBeenCalledWith("pane-1", {
      title: null,
      body: "",
    });

    const updateRes = await api.request("/sessions/pane-1/notes/note-1", {
      method: "PUT",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });
    expect(updateRes.status).toBe(200);
    expect(updateRepoNote).toHaveBeenCalledWith("pane-1", "note-1", {
      title: null,
      body: "",
    });
  });

  it("returns NOT_FOUND when updating a missing repo note", async () => {
    const { api, monitor, detail, updateRepoNote } = createTestContext();
    monitor.registry.update({
      ...detail,
      repoRoot: "/repo",
    });
    updateRepoNote.mockReturnValueOnce(null);

    const res = await api.request("/sessions/pane-1/notes/missing", {
      method: "PUT",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "todo", body: "write tests" }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("deletes repo note and validates note id", async () => {
    const { api, monitor, detail, deleteRepoNote } = createTestContext();
    monitor.registry.update({
      ...detail,
      repoRoot: "/repo",
    });

    const deleteRes = await api.request("/sessions/pane-1/notes/note-1", {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(deleteRes.status).toBe(200);
    expect(deleteRepoNote).toHaveBeenCalledWith("pane-1", "note-1");

    const invalidIdRes = await api.request("/sessions/pane-1/notes/%20", {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(invalidIdRes.status).toBe(400);
    const invalidIdData = await invalidIdRes.json();
    expect(invalidIdData.error.code).toBe("INVALID_PAYLOAD");
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

  it("marks pane as viewed on screen request", async () => {
    const { api, monitor } = createTestContext();
    const res = await api.request("/sessions/pane-1/screen", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ mode: "text", lines: 5 }),
    });

    expect(res.status).toBe(200);
    expect(monitor.markPaneViewed).toHaveBeenCalledWith("pane-1");
  });

  it("sends text command", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/pane-1/send/text", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: "ls", enter: true }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(actions.sendText).toHaveBeenCalledWith("pane-1", "ls", true);
  });

  it("deduplicates send text command by requestId", async () => {
    const { api, actions } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };
    const payload = JSON.stringify({ text: "ls", enter: true, requestId: "req-send-1" });

    const first = await api.request("/sessions/pane-1/send/text", {
      method: "POST",
      headers,
      body: payload,
    });
    const second = await api.request("/sessions/pane-1/send/text", {
      method: "POST",
      headers,
      body: payload,
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(true);
    expect(actions.sendText).toHaveBeenCalledTimes(1);
    expect(actions.sendText).toHaveBeenCalledWith("pane-1", "ls", true);
  });

  it("rejects requestId reuse with different send text payload", async () => {
    const { api, actions } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };

    const first = await api.request("/sessions/pane-1/send/text", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "ls", enter: true, requestId: "req-send-1" }),
    });
    const second = await api.request("/sessions/pane-1/send/text", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "pwd", enter: true, requestId: "req-send-1" }),
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(false);
    expect(secondData.command.error.code).toBe("INVALID_PAYLOAD");
    expect(secondData.command.error.message).toBe("requestId payload mismatch");
    expect(actions.sendText).toHaveBeenCalledTimes(1);
  });

  it("launches a new agent window in a session", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-req-1",
        windowName: "codex-work",
        cwd: "/tmp",
        agentOptions: ["--model", "gpt-5"],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(actions.launchAgentInSession).toHaveBeenCalledWith({
      sessionName: "dev-main",
      agent: "codex",
      windowName: "codex-work",
      cwd: "/tmp",
      agentOptions: ["--model", "gpt-5"],
      worktreePath: undefined,
      worktreeBranch: undefined,
      worktreeCreateIfMissing: undefined,
    });
  });

  it("passes worktree creation options to launch action", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "claude",
        requestId: "launch-req-create",
        worktreeBranch: "feature/new-pane",
        worktreeCreateIfMissing: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(actions.launchAgentInSession).toHaveBeenCalledWith({
      sessionName: "dev-main",
      agent: "claude",
      windowName: undefined,
      cwd: undefined,
      agentOptions: undefined,
      worktreePath: undefined,
      worktreeBranch: "feature/new-pane",
      worktreeCreateIfMissing: true,
    });
  });

  it("returns 400 for invalid launch payload", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
      }),
    });

    expect(res.status).toBe(400);
    expect(actions.launchAgentInSession).not.toHaveBeenCalled();
  });

  it("deduplicates launch command by requestId and sessionName", async () => {
    const { api, actions } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };
    const payload = JSON.stringify({
      sessionName: "dev-main",
      agent: "claude",
      requestId: "launch-req-1",
      windowName: "claude-work",
    });

    const first = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: payload,
    });
    const second = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: payload,
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(true);
    expect(actions.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("rejects launch requestId reuse with different payload", async () => {
    const { api, actions } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };

    const first = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-req-mismatch",
      }),
    });
    const second = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "claude",
        requestId: "launch-req-mismatch",
      }),
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(false);
    expect(secondData.command.error.code).toBe("INVALID_PAYLOAD");
    expect(secondData.command.error.message).toBe("requestId payload mismatch");
    expect(actions.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("replays cached launch response before rate-limit check", async () => {
    const { api, actions } = createTestContext({
      rateLimit: { ...defaultConfig.rateLimit, send: { windowMs: 1000, max: 1 } },
    });
    const headers = { ...authHeaders, "content-type": "application/json" };
    const payload = JSON.stringify({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "launch-req-rate-retry",
    });

    const first = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: payload,
    });
    const second = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: payload,
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(true);
    expect(actions.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent launch requests with same idempotency key", async () => {
    const { api, actions } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };
    const launchResult: Awaited<ReturnType<typeof actions.launchAgentInSession>> = {
      ok: true,
      result: {
        sessionName: "session",
        agent: "codex",
        windowId: "@42",
        windowIndex: 1,
        windowName: "codex-work",
        paneId: "%99",
        launchedCommand: "codex",
        resolvedOptions: [],
        verification: {
          status: "verified",
          observedCommand: "codex",
          attempts: 1,
        },
      },
      rollback: { attempted: false, ok: true },
    };
    const launchController: {
      resolve: (value: Awaited<ReturnType<typeof actions.launchAgentInSession>>) => void;
      pending: boolean;
    } = {
      resolve: () => undefined,
      pending: true,
    };

    vi.mocked(actions.launchAgentInSession).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          launchController.resolve = resolve;
          launchController.pending = false;
        }),
    );

    const requestBody = JSON.stringify({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "launch-concurrent-1",
    });
    const firstPromise = api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: requestBody,
    });
    const secondPromise = api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: requestBody,
    });
    for (let attempt = 0; attempt < 10 && launchController.pending; attempt += 1) {
      await Promise.resolve();
    }

    if (launchController.pending) {
      throw new Error("launch resolver is missing");
    }
    expect(actions.launchAgentInSession).toHaveBeenCalledTimes(1);
    launchController.resolve(launchResult);

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(true);
    expect(actions.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("returns rate limit error on repeated launch requests", async () => {
    const { api, actions } = createTestContext({
      rateLimit: { ...defaultConfig.rateLimit, send: { windowMs: 1000, max: 1 } },
    });
    const headers = { ...authHeaders, "content-type": "application/json" };
    const first = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-rate-limit-1",
      }),
    });
    const second = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-rate-limit-2",
      }),
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(false);
    expect(secondData.command.error.code).toBe("RATE_LIMIT");
    expect(secondData.command.rollback).toEqual({ attempted: false, ok: true });
    expect(actions.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("returns launch command errors from actions", async () => {
    const { api, actions } = createTestContext();
    vi.mocked(actions.launchAgentInSession).mockResolvedValueOnce({
      ok: false,
      error: { code: "TMUX_UNAVAILABLE", message: "launch-agent requires tmux backend" },
      rollback: { attempted: false, ok: true },
    });

    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-req-error",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(false);
    expect(data.command.error.code).toBe("TMUX_UNAVAILABLE");
  });

  it("focuses pane via focus endpoint", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/pane-1/focus", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(actions.focusPane).toHaveBeenCalledWith("pane-1");
  });

  it("kills pane via kill pane endpoint", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/pane-1/kill/pane", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(actions.killPane).toHaveBeenCalledWith("pane-1");
  });

  it("kills window via kill window endpoint", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/pane-1/kill/window", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(actions.killWindow).toHaveBeenCalledWith("pane-1");
  });

  it("focuses pane for wezterm backend as well", async () => {
    const { api } = createTestContext({
      multiplexer: {
        ...defaultConfig.multiplexer,
        backend: "wezterm",
      },
    });
    const res = await api.request("/sessions/pane-1/focus", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
  });

  it("returns rate limit error on repeated focus requests", async () => {
    const { api, actions } = createTestContext({
      rateLimit: { ...defaultConfig.rateLimit, send: { windowMs: 1000, max: 1 } },
    });
    const first = await api.request("/sessions/pane-1/focus", {
      method: "POST",
      headers: authHeaders,
    });
    const second = await api.request("/sessions/pane-1/focus", {
      method: "POST",
      headers: authHeaders,
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(false);
    expect(secondData.command.error.code).toBe("RATE_LIMIT");
    expect(actions.focusPane).toHaveBeenCalledTimes(1);
  });

  it("returns rate limit error on repeated kill pane requests", async () => {
    const { api, actions } = createTestContext({
      rateLimit: { ...defaultConfig.rateLimit, send: { windowMs: 1000, max: 1 } },
    });
    const first = await api.request("/sessions/pane-1/kill/pane", {
      method: "POST",
      headers: authHeaders,
    });
    const second = await api.request("/sessions/pane-1/kill/pane", {
      method: "POST",
      headers: authHeaders,
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(false);
    expect(secondData.command.error.code).toBe("RATE_LIMIT");
    expect(actions.killPane).toHaveBeenCalledTimes(1);
  });

  it("returns kill window command errors from actions", async () => {
    const { api, actions } = createTestContext();
    vi.mocked(actions.killWindow).mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "kill-window failed" },
    });

    const res = await api.request("/sessions/pane-1/kill/window", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(false);
    expect(data.command.error.code).toBe("INTERNAL");
  });

  it("returns focus command errors from actions", async () => {
    const { api, actions } = createTestContext();
    vi.mocked(actions.focusPane).mockResolvedValueOnce({
      ok: false,
      error: { code: "TMUX_UNAVAILABLE", message: "Terminal is not running" },
    });

    const res = await api.request("/sessions/pane-1/focus", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(false);
    expect(data.command.error.code).toBe("TMUX_UNAVAILABLE");
  });

  it("updates custom title", async () => {
    const { api, monitor } = createTestContext();
    const res = await api.request("/sessions/pane-1/title", {
      method: "PUT",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "new title" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.customTitle).toBe("new title");
    expect(monitor.setCustomTitle).toHaveBeenCalledWith("pane-1", "new title");
  });

  it("touch updates session activity", async () => {
    const { api, monitor } = createTestContext();
    const res = await api.request("/sessions/pane-1/touch", {
      method: "POST",
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(monitor.recordInput).toHaveBeenCalledWith("pane-1");
  });

  it("returns 404 when pane is missing on diff endpoint", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/missing/diff", {
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PANE");
  });

  it("returns 404 when pane is missing on focus endpoint", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/missing/focus", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PANE");
    expect(actions.focusPane).not.toHaveBeenCalled();
  });

  it("returns 404 when pane is missing on kill window endpoint", async () => {
    const { api, actions } = createTestContext();
    const res = await api.request("/sessions/missing/kill/window", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PANE");
    expect(actions.killWindow).not.toHaveBeenCalled();
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

  it("uses force=false by default on commit detail endpoint", async () => {
    vi.mocked(fetchCommitLog).mockResolvedValueOnce({
      repoRoot: "/tmp",
      rev: "HEAD",
      generatedAt: new Date(0).toISOString(),
      commits: [],
    });
    vi.mocked(fetchCommitDetail).mockResolvedValueOnce({
      hash: "hash",
      shortHash: "hash",
      subject: "subject",
      body: null,
      authorName: "tester",
      authorEmail: "tester@example.com",
      authoredAt: new Date(0).toISOString(),
      files: [],
    });
    const { api } = createTestContext();
    const res = await api.request("/sessions/pane-1/commits/hash", {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(fetchCommitDetail).toHaveBeenCalledWith("/tmp", "hash", { force: false });
  });

  it("uses force flag from query on commit file endpoint", async () => {
    vi.mocked(fetchCommitLog).mockResolvedValue({
      repoRoot: "/tmp",
      rev: "HEAD",
      generatedAt: new Date(0).toISOString(),
      commits: [],
    });
    vi.mocked(fetchCommitDetail).mockResolvedValue({
      hash: "hash",
      shortHash: "hash",
      subject: "subject",
      body: null,
      authorName: "tester",
      authorEmail: "tester@example.com",
      authoredAt: new Date(0).toISOString(),
      files: [
        {
          path: "src/index.ts",
          status: "M",
          additions: 1,
          deletions: 0,
        },
      ],
    });
    vi.mocked(fetchCommitFile).mockResolvedValue({
      path: "src/index.ts",
      status: "M",
      patch: "+line",
      binary: false,
      truncated: false,
    });

    const { api } = createTestContext();
    const first = await api.request("/sessions/pane-1/commits/hash/file?path=src/index.ts", {
      headers: authHeaders,
    });
    expect(first.status).toBe(200);
    expect(fetchCommitFile).toHaveBeenLastCalledWith(
      "/tmp",
      "hash",
      expect.objectContaining({ path: "src/index.ts" }),
      { force: false },
    );

    const second = await api.request(
      "/sessions/pane-1/commits/hash/file?path=src/index.ts&force=1",
      {
        headers: authHeaders,
      },
    );
    expect(second.status).toBe(200);
    expect(fetchCommitFile).toHaveBeenLastCalledWith(
      "/tmp",
      "hash",
      expect.objectContaining({ path: "src/index.ts" }),
      { force: true },
    );
  });

  it("returns 400 when commit log is unavailable on commit file endpoint", async () => {
    vi.mocked(fetchCommitLog).mockResolvedValueOnce({
      repoRoot: null,
      rev: null,
      generatedAt: new Date(0).toISOString(),
      commits: [],
      reason: "not_git",
    });
    const { api } = createTestContext();
    const res = await api.request("/sessions/pane-1/commits/hash/file?path=README.md", {
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  it("returns REPO_UNAVAILABLE when repoRoot is missing on file tree endpoint", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/pane-1/files/tree", {
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("REPO_UNAVAILABLE");
  });

  it("lists tree entries and applies includeIgnoredPaths override", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-tree-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await mkdir(path.join(tmpRoot, "build"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(tmpRoot, "src", "index.ts"), "export {};\n");
      await writeFile(path.join(tmpRoot, "build", "output.txt"), "hidden\n");

      const { api, monitor, detail } = createTestContext({
        fileNavigator: {
          includeIgnoredPaths: ["build/**"],
          autoExpandMatchLimit: 100,
        },
      });
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const rootRes = await api.request("/sessions/pane-1/files/tree?limit=200", {
        headers: authHeaders,
      });
      expect(rootRes.status).toBe(200);
      const rootData = await rootRes.json();
      const rootPaths = rootData.tree.entries.map((entry: { path: string }) => entry.path);
      expect(rootPaths).toContain("src");
      expect(rootPaths).toContain("build");

      const buildRes = await api.request("/sessions/pane-1/files/tree?path=build&limit=200", {
        headers: authHeaders,
      });
      expect(buildRes.status).toBe(200);
      const buildData = await buildRes.json();
      const buildPaths = buildData.tree.entries.map((entry: { path: string }) => entry.path);
      expect(buildPaths).toContain("build/output.txt");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("searches file names with space-separated words and returns truncation metadata", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-search-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(path.join(tmpRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "beta.ts"), "export const beta = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "gamma.ts"), "export const gamma = 1;\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const firstRes = await api.request("/sessions/pane-1/files/search?q=a&limit=1", {
        headers: authHeaders,
      });
      expect(firstRes.status).toBe(200);
      const firstData = await firstRes.json();
      expect(firstData.result.query).toBe("a");
      expect(firstData.result.items.length).toBe(1);
      expect(firstData.result.totalMatchedCount).toBeGreaterThanOrEqual(2);
      expect(firstData.result.truncated).toBe(true);
      expect(typeof firstData.result.nextCursor).toBe("string");
      expect(typeof firstData.result.items[0].score).toBe("number");
      expect(Array.isArray(firstData.result.items[0].highlights)).toBe(true);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("search endpoint matches files containing all query words", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-search-words-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(path.join(tmpRoot, "src", "alpha-beta.ts"), "export const alphaBeta = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "beta.ts"), "export const beta = 1;\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/search?q=alpha%20beta&limit=10", {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result.items.map((item: { path: string }) => item.path)).toEqual([
        "src/alpha-beta.ts",
      ]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("accepts file search queries longer than 200 characters", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-search-long-query-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      const longFilename = `${"a".repeat(210)}.ts`;
      await writeFile(path.join(tmpRoot, "src", longFilename), "export const long = 1;\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const query = encodeURIComponent(longFilename);
      const res = await api.request(`/sessions/pane-1/files/search?q=${query}&limit=10`, {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result.query).toBe(longFilename);
      expect(data.result.items.map((item: { path: string }) => item.path)).toContain(
        `src/${longFilename}`,
      );
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns file content with truncation metadata", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-"));
    try {
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(path.join(tmpRoot, "README.md"), "# title\nbody\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/content?path=README.md&maxBytes=5", {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.file.path).toBe("README.md");
      expect(data.file.isBinary).toBe(false);
      expect(data.file.truncated).toBe(true);
      expect(data.file.languageHint).toBe("markdown");
      expect(data.file.content).toBe("# tit");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns FORBIDDEN_PATH when content target is ignored and not overridden", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-policy-"));
    try {
      await mkdir(path.join(tmpRoot, "build"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(tmpRoot, "build", "output.txt"), "hidden\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/content?path=build/output.txt", {
        headers: authHeaders,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN_PATH");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns FORBIDDEN_PATH when content target is a symbolic link", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-symlink-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-outside-"));
    try {
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      const outsideFile = path.join(outsideRoot, "outside.txt");
      await writeFile(outsideFile, "outside\n");
      try {
        await symlink(outsideFile, path.join(tmpRoot, "outside-link.txt"));
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
          return;
        }
        throw error;
      }

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/content?path=outside-link.txt", {
        headers: authHeaders,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN_PATH");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("returns 400 when image attachment content-length is missing", async () => {
    const { api } = createTestContext();
    const payload = createMultipartImagePayload();
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
      },
      body: payload.body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("content-length header is required");
  });

  it("returns 400 when image attachment content-length is invalid", async () => {
    const { api } = createTestContext();
    const payload = createMultipartImagePayload();
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
        "x-content-length": "abc",
      },
      body: payload.body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("invalid content-length");
  });

  it("returns 400 when image attachment content-length exceeds limit", async () => {
    const { api } = createTestContext();
    const payload = createMultipartImagePayload();
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
        "x-content-length": String(IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES + 1),
      },
      body: payload.body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("attachment exceeds content-length limit");
  });

  it("returns 400 when image field is missing", async () => {
    const { api } = createTestContext();
    const formData = new FormData();
    formData.set(
      "file",
      new File([new TextEncoder().encode("png-data")], "sample.png", {
        type: "image/png",
      }),
    );
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "x-content-length": "128",
      },
      body: formData,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("image field is required");
  });

  it("stores uploaded image and returns attachment metadata", async () => {
    const { api } = createTestContext();
    const formData = new FormData();
    formData.set(
      "image",
      new File([new TextEncoder().encode("png-data")], "sample.png", {
        type: "image/png",
      }),
    );
    const originalTmpDir = process.env.TMPDIR;
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-api-router-"));
    process.env.TMPDIR = tmpRoot;

    try {
      const res = await api.request("/sessions/pane-1/attachments/image", {
        method: "POST",
        headers: {
          ...authHeaders,
          "x-content-length": "128",
        },
        body: formData,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const realTmpRoot = await realpath(tmpRoot);
      expect(data.attachment.mimeType).toBe("image/png");
      expect(data.attachment.size).toBeGreaterThan(0);
      expect(data.attachment.size).toBeLessThanOrEqual(IMAGE_ATTACHMENT_MAX_BYTES);
      expect(
        data.attachment.path.startsWith(path.join(realTmpRoot, "vde-monitor", "attachments")),
      ).toBe(true);
      expect(data.attachment.insertText).toBe(`${data.attachment.path} `);
    } finally {
      if (typeof originalTmpDir === "string") {
        process.env.TMPDIR = originalTmpDir;
      } else {
        delete process.env.TMPDIR;
      }
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("accepts a 10MB file even when multipart content-length is larger than 10MB", async () => {
    const { api } = createTestContext();
    const formData = new FormData();
    formData.set(
      "image",
      new File([new Uint8Array(IMAGE_ATTACHMENT_MAX_BYTES).fill(1)], "sample.png", {
        type: "image/png",
      }),
    );
    const simulatedContentLength = IMAGE_ATTACHMENT_MAX_BYTES + 1024;
    expect(simulatedContentLength).toBeLessThanOrEqual(IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES);

    const originalTmpDir = process.env.TMPDIR;
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-api-router-"));
    process.env.TMPDIR = tmpRoot;

    try {
      const res = await api.request("/sessions/pane-1/attachments/image", {
        method: "POST",
        headers: {
          ...authHeaders,
          "x-content-length": String(simulatedContentLength),
        },
        body: formData,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.attachment.size).toBe(IMAGE_ATTACHMENT_MAX_BYTES);
    } finally {
      if (typeof originalTmpDir === "string") {
        process.env.TMPDIR = originalTmpDir;
      } else {
        delete process.env.TMPDIR;
      }
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
