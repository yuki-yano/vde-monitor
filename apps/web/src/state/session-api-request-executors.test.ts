import type { SessionSummary } from "@vde-monitor/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { requestJson } from "@/lib/api-utils";

import {
  mutateSession,
  refreshSessions,
  requestCommand,
  requestImageAttachment,
  requestScreenResponse,
  requestSessionField,
} from "./session-api-request-executors";

vi.mock("@/lib/api-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-utils")>("@/lib/api-utils");
  return {
    ...actual,
    requestJson: vi.fn(),
  };
});

const createSession = (
  paneId: string,
  overrides: Partial<SessionSummary> = {},
): SessionSummary => ({
  paneId,
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: null,
  paneTty: null,
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
  ...overrides,
});

describe("session-api-request-executors", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requestSessionField returns requested field on success", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: { summary: { rev: "main" } },
    });

    const summary = await requestSessionField<{ summary?: { rev: string } }, "summary">({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      field: "summary",
      fallbackMessage: "failed",
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
    });

    expect(summary).toEqual({ rev: "main" });
    expect(ensureToken).toHaveBeenCalledTimes(1);
    expect(handleSessionMissing).not.toHaveBeenCalled();
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
  });

  it("requestSessionField propagates API errors and marks missing panes", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 404 }),
      data: { error: { code: "INVALID_PANE", message: "pane not found" } },
    });

    await expect(
      requestSessionField<{ summary?: { rev: string } }, "summary">({
        paneId: "pane-1",
        request: Promise.resolve(new Response()),
        field: "summary",
        fallbackMessage: "failed",
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
        includeStatus: true,
      }),
    ).rejects.toThrow("pane not found");

    expect(handleSessionMissing).toHaveBeenCalledTimes(1);
    expect(onConnectionIssue).toHaveBeenCalledWith("pane not found");
  });

  it("mutateSession updates session when payload contains session", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionUpdated = vi.fn();
    const refreshSessions = vi.fn(async () => ({ ok: true }));
    const session = createSession("pane-1", { title: "updated" });
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: { session },
    });

    const updated = await mutateSession({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      fallbackMessage: "failed",
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
      onSessionUpdated,
      refreshSessions,
    });

    expect(updated).toEqual(session);
    expect(onSessionUpdated).toHaveBeenCalledWith(session);
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
    expect(refreshSessions).not.toHaveBeenCalled();
  });

  it("mutateSession refreshes sessions when payload omits session", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionUpdated = vi.fn();
    const refreshSessions = vi.fn(async () => ({ ok: true }));
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: {},
    });

    const updated = await mutateSession({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      fallbackMessage: "failed",
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
      onSessionUpdated,
      refreshSessions,
    });

    expect(updated).toBeNull();
    expect(onSessionUpdated).not.toHaveBeenCalled();
    expect(refreshSessions).toHaveBeenCalledTimes(1);
  });

  it("requestCommand returns command payload and clears connection issue", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: { command: { ok: true } },
    });

    const response = await requestCommand({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      fallbackMessage: "failed",
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
      buildApiError: (code, message) => ({ code, message }),
      isPaneMissingError: vi.fn(() => false),
      onSessionRemoved,
    });

    expect(response).toEqual({ ok: true });
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
    expect(handleSessionMissing).not.toHaveBeenCalled();
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("requestCommand returns api error response when request fails", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 404 }),
      data: { error: { code: "INVALID_PANE", message: "pane not found" } },
    });

    const response = await requestCommand({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      fallbackMessage: "failed",
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
      buildApiError: (code, message) => ({ code, message }),
      isPaneMissingError: vi.fn(() => false),
      onSessionRemoved,
    });

    expect(response).toEqual({
      ok: false,
      error: { code: "INVALID_PANE", message: "pane not found" },
    });
    expect(onConnectionIssue).toHaveBeenCalledWith("pane not found");
    expect(handleSessionMissing).toHaveBeenCalledTimes(1);
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("requestCommand handles thrown errors as INTERNAL", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockRejectedValueOnce(new Error("network down"));

    const response = await requestCommand({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      fallbackMessage: "failed",
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
      buildApiError: (code, message) => ({ code, message }),
      isPaneMissingError: vi.fn(() => false),
      onSessionRemoved,
    });

    expect(response).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "network down" },
    });
    expect(onConnectionIssue).toHaveBeenCalledWith("network down");
    expect(handleSessionMissing).not.toHaveBeenCalled();
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("requestScreenResponse returns screen payload on success", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: {
        screen: {
          ok: true,
          paneId: "pane-1",
          mode: "text",
          capturedAt: new Date(0).toISOString(),
          screen: "ok",
        },
      },
    });

    const response = await requestScreenResponse({
      paneId: "pane-1",
      mode: "text",
      request: Promise.resolve(new Response()),
      fallbackMessage: "screen failed",
      onConnectionIssue,
      handleSessionMissing,
      isPaneMissingError: vi.fn(() => false),
      onSessionRemoved,
      buildApiError: (code, message) => ({ code, message }),
    });

    expect(response).toMatchObject({ ok: true, paneId: "pane-1" });
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
    expect(handleSessionMissing).not.toHaveBeenCalled();
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("requestScreenResponse returns error screen on http errors", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 429 }),
      data: {
        error: { code: "RATE_LIMIT", message: "too many requests" },
      },
    });

    const response = await requestScreenResponse({
      paneId: "pane-1",
      mode: "image",
      request: Promise.resolve(new Response()),
      fallbackMessage: "screen failed",
      onConnectionIssue,
      handleSessionMissing,
      isPaneMissingError: vi.fn(() => false),
      onSessionRemoved,
      buildApiError: (code, message) => ({ code, message }),
    });

    expect(response.ok).toBe(false);
    expect(response.error).toEqual({ code: "RATE_LIMIT", message: "too many requests" });
    expect(onConnectionIssue).toHaveBeenCalledWith("too many requests");
    expect(handleSessionMissing).toHaveBeenCalledTimes(1);
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("requestScreenResponse returns INTERNAL screen on thrown errors", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockRejectedValueOnce(new Error("network down"));

    const response = await requestScreenResponse({
      paneId: "pane-1",
      mode: "text",
      request: Promise.resolve(new Response()),
      fallbackMessage: "screen failed",
      onConnectionIssue,
      handleSessionMissing,
      isPaneMissingError: vi.fn(() => false),
      onSessionRemoved,
      buildApiError: (code, message) => ({ code, message }),
    });

    expect(response.ok).toBe(false);
    expect(response.error).toEqual({ code: "INTERNAL", message: "network down" });
    expect(onConnectionIssue).toHaveBeenCalledWith("network down");
    expect(handleSessionMissing).not.toHaveBeenCalled();
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("requestImageAttachment returns parsed attachment payload", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: {
        attachment: {
          path: "/tmp/vde-monitor/attachments/%251/mobile-20260208-000000-abcd1234.png",
          mimeType: "image/png",
          size: 3,
          createdAt: "2026-02-08T00:00:00.000Z",
          insertText: "/tmp/vde-monitor/attachments/%251/mobile-20260208-000000-abcd1234.png ",
        },
      },
    });

    const attachment = await requestImageAttachment({
      paneId: "pane-1",
      request: Promise.resolve(new Response()),
      ensureToken,
      onConnectionIssue,
      handleSessionMissing,
    });

    expect(attachment).toMatchObject({ mimeType: "image/png", size: 3 });
    expect(ensureToken).toHaveBeenCalledTimes(1);
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
    expect(handleSessionMissing).not.toHaveBeenCalled();
  });

  it("requestImageAttachment throws invalid response when schema validation fails", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const ensureToken = vi.fn();
    const onConnectionIssue = vi.fn();
    const handleSessionMissing = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: {
        attachment: {
          path: "/tmp/vde-monitor/attachments/%251/mobile-20260208-000000-abcd1234.png",
          mimeType: "image/png",
          size: 0,
          createdAt: "2026-02-08T00:00:00.000Z",
          insertText: "/tmp/vde-monitor/attachments/%251/mobile-20260208-000000-abcd1234.png ",
        },
      },
    });

    await expect(
      requestImageAttachment({
        paneId: "pane-1",
        request: Promise.resolve(new Response()),
        ensureToken,
        onConnectionIssue,
        handleSessionMissing,
      }),
    ).rejects.toThrow(API_ERROR_MESSAGES.invalidResponse);

    expect(onConnectionIssue).toHaveBeenCalledWith(API_ERROR_MESSAGES.invalidResponse);
    expect(handleSessionMissing).not.toHaveBeenCalled();
  });

  it("refreshSessions returns auth error without request when token is missing", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onSessions = vi.fn();
    const onConnectionIssue = vi.fn();
    const onHighlightCorrections = vi.fn();
    const onFileNavigatorConfig = vi.fn();

    const result = await refreshSessions({
      token: null,
      request: Promise.resolve(new Response()),
      onSessions,
      onConnectionIssue,
      onHighlightCorrections,
      onFileNavigatorConfig,
    });

    expect(result).toEqual({ ok: false, authError: true });
    expect(requestJsonMock).not.toHaveBeenCalled();
    expect(onSessions).not.toHaveBeenCalled();
    expect(onConnectionIssue).not.toHaveBeenCalled();
    expect(onHighlightCorrections).not.toHaveBeenCalled();
    expect(onFileNavigatorConfig).not.toHaveBeenCalled();
  });

  it("refreshSessions applies sessions snapshot on success", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onSessions = vi.fn();
    const onConnectionIssue = vi.fn();
    const onHighlightCorrections = vi.fn();
    const onFileNavigatorConfig = vi.fn();
    const sessions = [createSession("pane-1")];
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 200 }),
      data: { sessions },
    });

    const result = await refreshSessions({
      token: "token",
      request: Promise.resolve(new Response()),
      onSessions,
      onConnectionIssue,
      onHighlightCorrections,
      onFileNavigatorConfig,
    });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(onSessions).toHaveBeenCalledWith(sessions);
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
    expect(onFileNavigatorConfig).not.toHaveBeenCalled();
  });

  it("refreshSessions marks auth failures from response status", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onSessions = vi.fn();
    const onConnectionIssue = vi.fn();
    const onHighlightCorrections = vi.fn();
    const onFileNavigatorConfig = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 401 }),
      data: { error: { code: "INVALID_PAYLOAD", message: "unauthorized" } },
    });

    const result = await refreshSessions({
      token: "token",
      request: Promise.resolve(new Response()),
      onSessions,
      onConnectionIssue,
      onHighlightCorrections,
      onFileNavigatorConfig,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      authError: true,
      rateLimited: false,
    });
    expect(onSessions).not.toHaveBeenCalled();
    expect(onConnectionIssue).toHaveBeenCalledWith(API_ERROR_MESSAGES.unauthorized);
    expect(onFileNavigatorConfig).not.toHaveBeenCalled();
  });

  it("refreshSessions reports network fallback error", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onSessions = vi.fn();
    const onConnectionIssue = vi.fn();
    const onHighlightCorrections = vi.fn();
    const onFileNavigatorConfig = vi.fn();
    requestJsonMock.mockRejectedValueOnce(new Error("offline"));

    const result = await refreshSessions({
      token: "token",
      request: Promise.resolve(new Response()),
      onSessions,
      onConnectionIssue,
      onHighlightCorrections,
      onFileNavigatorConfig,
    });

    expect(result).toEqual({ ok: false });
    expect(onSessions).not.toHaveBeenCalled();
    expect(onConnectionIssue).toHaveBeenCalledWith("offline");
    expect(onFileNavigatorConfig).not.toHaveBeenCalled();
  });
});
