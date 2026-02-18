import { act, renderHook, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionListPins } from "./useSessionListPins";

const STORAGE_KEY = "vde-monitor-session-list-pins";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "%1",
  sessionName: "main",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActive: false,
  currentCommand: null,
  currentPath: null,
  paneTty: null,
  title: null,
  customTitle: null,
  agent: "unknown",
  state: "UNKNOWN",
  stateReason: "no_signal",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  repoRoot: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("useSessionListPins", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads stored pin values and resolves repo sort anchor", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        repos: {
          "repo:/repo/a": 111,
        },
      }),
    );
    const { result } = renderHook(() =>
      useSessionListPins({
        sessions: [buildSession({ paneId: "%1", repoRoot: "/repo/a" })],
      }),
    );

    expect(result.current.getRepoSortAnchorAt("/repo/a")).toBe(111);
    expect(result.current.getRepoSortAnchorAt("/repo/b")).toBeNull();
  });

  it("touches repo pin and persists storage", async () => {
    const { result } = renderHook(() =>
      useSessionListPins({
        sessions: [buildSession({ paneId: "%1", repoRoot: "/repo/a" })],
      }),
    );

    act(() => {
      result.current.touchRepoPin("/repo/a");
    });

    await waitFor(() => {
      expect(result.current.getRepoSortAnchorAt("/repo/a")).toBeTypeOf("number");
    });
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? "{}") as { repos?: Record<string, number> };
    expect(parsed.repos?.["repo:/repo/a"]).toBeTypeOf("number");
  });

  it("touches pane pin and triggers onTouchPane callback", async () => {
    const onTouchPane = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSessionListPins({
        sessions: [buildSession({ paneId: "%1", repoRoot: "/repo/a" })],
        onTouchPane,
      }),
    );

    act(() => {
      result.current.touchPanePin("%1");
    });

    await waitFor(() => {
      expect(result.current.getRepoSortAnchorAt("/repo/a")).toBeTypeOf("number");
    });
    expect(onTouchPane).toHaveBeenCalledWith("%1");
  });
});
