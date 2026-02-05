// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import type { CommitLog, DiffSummary } from "@vde-monitor/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestJson } from "@/lib/api-utils";

import { useSessionApi } from "./use-session-api";

const mockPost = vi.fn(() => Promise.resolve(new Response()));
const mockGet = vi.fn(() => Promise.resolve(new Response()));
const mockApiClient = {
  sessions: {
    ":paneId": {
      screen: { $post: mockPost },
      diff: {
        $get: mockGet,
        file: { $get: mockGet },
      },
      commits: {
        $get: mockGet,
        ":hash": { $get: mockGet, file: { $get: mockGet } },
      },
    },
  },
};

vi.mock("hono/client", () => ({
  hc: () => mockApiClient,
}));

vi.mock("@/lib/api-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-utils")>("@/lib/api-utils");
  return {
    ...actual,
    requestJson: vi.fn(),
  };
});

describe("useSessionApi", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dedupes in-flight screen requests", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    let resolveRequest: ((value: { res: Response; data: unknown }) => void) | undefined;
    const deferred = new Promise<{ res: Response; data: unknown }>((resolve) => {
      resolveRequest = resolve;
    });
    requestJsonMock.mockReturnValue(deferred as Promise<never>);

    const { result } = renderHook(() =>
      useSessionApi({
        token: "token",
        onSessions: vi.fn(),
        onConnectionIssue: vi.fn(),
        onReadOnly: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionRemoved: vi.fn(),
        onHighlightCorrections: vi.fn(),
      }),
    );

    const promise1 = result.current.requestScreen("pane-1", { mode: "text" });
    const promise2 = result.current.requestScreen("pane-1", { mode: "text" });

    expect(requestJsonMock).toHaveBeenCalledTimes(1);

    resolveRequest?.({
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

    await expect(promise1).resolves.toMatchObject({ ok: true, paneId: "pane-1" });
    await expect(promise2).resolves.toMatchObject({ ok: true, paneId: "pane-1" });
  });

  it("updates connectionIssue on diff summary errors and clears on success", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onConnectionIssue = vi.fn();
    const summary: DiffSummary = {
      repoRoot: "/repo",
      rev: "main",
      generatedAt: new Date(0).toISOString(),
      files: [],
    };
    requestJsonMock
      .mockResolvedValueOnce({
        res: new Response(null, { status: 500 }),
        data: { error: { code: "INTERNAL", message: "boom" } },
      })
      .mockResolvedValueOnce({
        res: new Response(null, { status: 200 }),
        data: { summary },
      });

    const { result } = renderHook(() =>
      useSessionApi({
        token: "token",
        onSessions: vi.fn(),
        onConnectionIssue,
        onReadOnly: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionRemoved: vi.fn(),
        onHighlightCorrections: vi.fn(),
      }),
    );

    await expect(result.current.requestDiffSummary("pane-1")).rejects.toThrow("boom");
    expect(onConnectionIssue).toHaveBeenCalledWith("boom");

    await expect(result.current.requestDiffSummary("pane-1")).resolves.toEqual(summary);
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
  });

  it("updates connectionIssue on commit log errors and clears on success", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onConnectionIssue = vi.fn();
    const log: CommitLog = {
      repoRoot: "/repo",
      rev: "main",
      generatedAt: new Date(0).toISOString(),
      commits: [],
    };
    requestJsonMock
      .mockResolvedValueOnce({
        res: new Response(null, { status: 502 }),
        data: { error: { code: "INTERNAL", message: "bad" } },
      })
      .mockResolvedValueOnce({
        res: new Response(null, { status: 200 }),
        data: { log },
      });

    const { result } = renderHook(() =>
      useSessionApi({
        token: "token",
        onSessions: vi.fn(),
        onConnectionIssue,
        onReadOnly: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionRemoved: vi.fn(),
        onHighlightCorrections: vi.fn(),
      }),
    );

    await expect(result.current.requestCommitLog("pane-1")).rejects.toThrow("bad");
    expect(onConnectionIssue).toHaveBeenCalledWith("bad");

    await expect(result.current.requestCommitLog("pane-1")).resolves.toEqual(log);
    expect(onConnectionIssue).toHaveBeenCalledWith(null);
  });

  it("does not remove session when commit detail is missing", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 404 }),
      data: { error: { code: "NOT_FOUND", message: "commit not found" } },
    });

    const { result } = renderHook(() =>
      useSessionApi({
        token: "token",
        onSessions: vi.fn(),
        onConnectionIssue: vi.fn(),
        onReadOnly: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionRemoved,
        onHighlightCorrections: vi.fn(),
      }),
    );

    await expect(result.current.requestCommitDetail("pane-1", "hash")).rejects.toThrow(
      "commit not found",
    );
    expect(onSessionRemoved).not.toHaveBeenCalled();
  });

  it("removes session when pane is invalid", async () => {
    const requestJsonMock = vi.mocked(requestJson);
    const onSessionRemoved = vi.fn();
    requestJsonMock.mockResolvedValueOnce({
      res: new Response(null, { status: 404 }),
      data: { error: { code: "INVALID_PANE", message: "pane not found" } },
    });

    const { result } = renderHook(() =>
      useSessionApi({
        token: "token",
        onSessions: vi.fn(),
        onConnectionIssue: vi.fn(),
        onReadOnly: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionRemoved,
        onHighlightCorrections: vi.fn(),
      }),
    );

    await expect(result.current.requestCommitDetail("pane-1", "hash")).rejects.toThrow(
      "pane not found",
    );
    expect(onSessionRemoved).toHaveBeenCalledWith("pane-1");
  });
});
