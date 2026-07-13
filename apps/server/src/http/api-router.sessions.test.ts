import { configDefaults } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authHeaders, createTestContext } from "./api-router.test-helpers";

describe("createApiRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(data.clientConfig.capabilities).toEqual({
      screenImage: true,
      launchAgent: true,
      resumeAgent: true,
    });
  });

  it("returns 404 when session is missing", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/missing", { headers: authHeaders });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PANE");
  });

  it("acknowledges the observed completion generation", async () => {
    const { api, acknowledgeView } = createTestContext();
    const res = await api.request("/sessions/pane-1/state/acknowledge", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ epoch: "epoch-1", throughSeq: 3 }),
    });

    expect(res.status).toBe(200);
    expect(acknowledgeView).toHaveBeenCalledWith({
      paneId: "pane-1",
      epoch: "epoch-1",
      throughSeq: 3,
    });
    await expect(res.json()).resolves.toMatchObject({ session: { paneId: "pane-1" } });
  });

  it("validates acknowledge epoch and throughSeq boundaries", async () => {
    const { api, acknowledgeView } = createTestContext();
    const invalidBodies = [
      { epoch: "", throughSeq: 0 },
      { epoch: "é", throughSeq: 0 },
      { epoch: "a".repeat(129), throughSeq: 0 },
      { epoch: "epoch-1", throughSeq: -1 },
      { epoch: "epoch-1", throughSeq: 0.5 },
      { epoch: "epoch-1", throughSeq: Number.MAX_SAFE_INTEGER + 1 },
      { epoch: "epoch-1", throughSeq: 0, extra: true },
    ];

    for (const body of invalidBodies) {
      const res = await api.request("/sessions/pane-1/state/acknowledge", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
    expect(acknowledgeView).not.toHaveBeenCalled();
  });

  it("returns INVALID_PANE for acknowledge on a missing pane", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/missing/state/acknowledge", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ epoch: "epoch-1", throughSeq: 1 }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "INVALID_PANE" } });
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

  it("accepts 7d timeline range values", async () => {
    const { api, getStateTimeline } = createTestContext();
    const res = await api.request("/sessions/pane-1/timeline?range=7d&limit=20", {
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(getStateTimeline).toHaveBeenCalledWith("pane-1", "7d", 20);
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
    const { api } = createTestContext();
    const payload = JSON.stringify({ mode: "text", lines: 5 });
    const headers = { ...authHeaders, "content-type": "application/json" };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await api.request("/sessions/pane-1/screen", {
        method: "POST",
        headers,
        body: payload,
      });
      const data = await response.json();
      expect(data.screen.ok).toBe(true);
    }
    const limited = await api.request("/sessions/pane-1/screen", {
      method: "POST",
      headers,
      body: payload,
    });
    const limitedData = await limited.json();
    expect(limitedData.screen.ok).toBe(false);
    expect(limitedData.screen.error.code).toBe("RATE_LIMIT");
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

  it("launches a new agent window in a session", async () => {
    const { api, launchCapability } = createTestContext();
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
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledWith({
      sessionName: "dev-main",
      agent: "codex",
      windowName: "codex-work",
      cwd: "/tmp",
      agentOptions: ["--model", "gpt-5"],
      worktreePath: undefined,
      worktreeBranch: undefined,
      worktreeCreateIfMissing: undefined,
      resumeSessionId: undefined,
      resumeFromPaneId: undefined,
    });
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

  it("rejects launch requestId reuse with different payload", async () => {
    const { api, launchCapability } = createTestContext();
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
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("passes worktree creation options to launch action", async () => {
    const { api, launchCapability } = createTestContext();
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
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledWith({
      sessionName: "dev-main",
      agent: "claude",
      windowName: undefined,
      cwd: undefined,
      agentOptions: undefined,
      worktreePath: undefined,
      worktreeBranch: "feature/new-pane",
      worktreeCreateIfMissing: true,
      resumeSessionId: undefined,
      resumeFromPaneId: undefined,
    });
  });

  it("returns 400 for invalid launch payload", async () => {
    const { api, launchCapability } = createTestContext();
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
      }),
    });

    expect(res.status).toBe(400);
    expect(launchCapability.launchAgentInSession).not.toHaveBeenCalled();
  });

  it("returns RESUME_INVALID_INPUT when required resume fails", async () => {
    const { api, launchCapability } = createTestContext();
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-required-resume-fail",
        resumeFromPaneId: "%missing",
        resumePolicy: "required",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(false);
    expect(data.command.error.code).toBe("RESUME_INVALID_INPUT");
    expect(data.command.resume).toMatchObject({
      requested: true,
      reused: false,
      failureReason: "invalid_input",
      policy: "required",
    });
    expect(launchCapability.launchAgentInSession).not.toHaveBeenCalled();
  });

  it("falls back to new launch on best_effort resume resolve failure", async () => {
    const { api, launchCapability } = createTestContext();
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-best-effort-resume-fail",
        resumeFromPaneId: "%missing",
        resumePolicy: "best_effort",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(data.command.resume).toMatchObject({
      requested: true,
      reused: false,
      fallbackReason: "invalid_input",
      policy: "best_effort",
    });
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeSessionId: undefined,
        resumeFromPaneId: "%missing",
      }),
    );
  });

  it("returns WEZTERM_UNAVAILABLE with resume unsupported metadata on wezterm backend", async () => {
    const { api, launchCapability } = createTestContext({
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "wezterm",
      },
    });
    const res = await api.request("/sessions/launch", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-wezterm-resume",
        resumeSessionId: "sess-1",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(false);
    expect(data.command.error.code).toBe("WEZTERM_UNAVAILABLE");
    expect(data.command.resume).toMatchObject({
      requested: true,
      reused: false,
      failureReason: "unsupported",
    });
    expect(launchCapability.launchAgentInSession).not.toHaveBeenCalled();
  });

  it("deduplicates launch command by requestId and sessionName", async () => {
    const { api, launchCapability } = createTestContext();
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
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("treats omitted resumePolicy and required as the same idempotency payload for manual resume", async () => {
    const { api, launchCapability } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };

    const first = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-resume-idempotent",
        resumeSessionId: "sess-1",
      }),
    });
    const second = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-resume-idempotent",
        resumeSessionId: "sess-1",
        resumePolicy: "required",
      }),
    });

    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(true);
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("replays cached launch response before rate-limit check", async () => {
    const { api, launchCapability } = createTestContext();
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
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent launch requests with same idempotency key", async () => {
    const { api, launchCapability } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };
    const launchResult: Awaited<ReturnType<typeof launchCapability.launchAgentInSession>> = {
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
      resolve: (value: Awaited<ReturnType<typeof launchCapability.launchAgentInSession>>) => void;
      pending: boolean;
    } = {
      resolve: () => undefined,
      pending: true,
    };

    vi.mocked(launchCapability.launchAgentInSession).mockImplementationOnce(
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
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(1);
    launchController.resolve(launchResult);

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    const firstData = await first.json();
    const secondData = await second.json();
    expect(firstData.command.ok).toBe(true);
    expect(secondData.command.ok).toBe(true);
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(1);
  });

  it("returns rate limit error on repeated launch requests", async () => {
    const { api, launchCapability } = createTestContext();
    const headers = { ...authHeaders, "content-type": "application/json" };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await api.request("/sessions/launch", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sessionName: "dev-main",
          agent: "codex",
          requestId: `launch-rate-limit-${attempt}`,
        }),
      });
      const data = await response.json();
      expect(data.command.ok).toBe(true);
    }
    const limited = await api.request("/sessions/launch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionName: "dev-main",
        agent: "codex",
        requestId: "launch-rate-limit-overflow",
      }),
    });
    const limitedData = await limited.json();
    expect(limitedData.command.ok).toBe(false);
    expect(limitedData.command.error.code).toBe("RATE_LIMIT");
    expect(limitedData.command.rollback).toEqual({ attempted: false, ok: true });
    expect(launchCapability.launchAgentInSession).toHaveBeenCalledTimes(10);
  });

  it("returns launch command errors from actions", async () => {
    const { api, launchCapability } = createTestContext();
    vi.mocked(launchCapability.launchAgentInSession).mockResolvedValueOnce({
      ok: false,
      error: { code: "WEZTERM_UNAVAILABLE", message: "launch-agent requires tmux backend" },
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
    expect(data.command.error.code).toBe("WEZTERM_UNAVAILABLE");
  });

  it("focuses pane via focus endpoint", async () => {
    const { api, actions, monitor } = createTestContext();
    const res = await api.request("/sessions/pane-1/focus", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.command.ok).toBe(true);
    expect(actions.focusPane).toHaveBeenCalledWith("pane-1");
    expect(monitor.markPaneObservationDirty).toHaveBeenCalledWith("pane-1", "focus");
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
    expect(actions.killWindow).toHaveBeenCalledWith("pane-1", "window-0");
  });

  it("focuses pane for wezterm backend as well", async () => {
    const { api } = createTestContext({
      multiplexer: {
        ...configDefaults.multiplexer,
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

  it.each([
    {
      label: "focus",
      path: "/sessions/pane-1/focus",
      actionKey: "focusPane" as const,
    },
    {
      label: "kill pane",
      path: "/sessions/pane-1/kill/pane",
      actionKey: "killPane" as const,
    },
  ])("returns rate limit error on repeated $label requests", async ({ path, actionKey }) => {
    const { api, actions } = createTestContext();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await api.request(path, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await response.json();
      expect(data.command.ok).toBe(true);
    }
    const limited = await api.request(path, {
      method: "POST",
      headers: authHeaders,
    });
    const limitedData = await limited.json();
    expect(limitedData.command.ok).toBe(false);
    expect(limitedData.command.error.code).toBe("RATE_LIMIT");
    expect(actions[actionKey]).toHaveBeenCalledTimes(10);
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
    const { api, actions, monitor } = createTestContext();
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
    expect(monitor.markPaneObservationDirty).not.toHaveBeenCalled();
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

  it("resets title by clearing pane title and custom title", async () => {
    const { api, actions, monitor } = createTestContext();
    const latest = monitor.registry.getDetail("pane-1");
    if (!latest) {
      throw new Error("session not found");
    }
    monitor.registry.update({
      ...latest,
      title: "✳ Initial Greeting",
      customTitle: "Custom",
    });

    const res = await api.request("/sessions/pane-1/title/reset", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(actions.clearPaneTitle).toHaveBeenCalledWith("pane-1");
    expect(monitor.setCustomTitle).toHaveBeenCalledWith("pane-1", null);
    expect(data.session.customTitle).toBeNull();
    expect(data.session.title).toBeNull();
  });

  it("returns error when pane title reset action fails", async () => {
    const { api, actions, monitor } = createTestContext();
    vi.mocked(actions.clearPaneTitle).mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "clear failed" },
    });

    const res = await api.request("/sessions/pane-1/title/reset", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe("INTERNAL");
    expect(monitor.setCustomTitle).not.toHaveBeenCalledWith("pane-1", null);
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
});
