import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionListPins } from "./useSessionListPins";

const STORAGE_KEY = "vde-monitor-session-list-pins";

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
    const { result } = renderHook(() => useSessionListPins({}));

    expect(result.current.getRepoSortAnchorAt("/repo/a")).toBe(111);
    expect(result.current.getRepoSortAnchorAt("/repo/b")).toBeNull();
  });

  it("composes consecutive repo pin updates before a rerender", () => {
    const { result, unmount } = renderHook(() => useSessionListPins({}));

    act(() => {
      result.current.touchRepoPin("/repo/a");
      result.current.touchRepoPin("/repo/b");
    });

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(stored ?? "{}") as { repos?: Record<string, number> };
    expect(parsed.repos?.["repo:/repo/a"]).toBeTypeOf("number");
    expect(parsed.repos?.["repo:/repo/b"]).toBeTypeOf("number");
    expect(result.current.getRepoSortAnchorAt("/repo/a")).toBeTypeOf("number");
    unmount();
    const restored = renderHook(() => useSessionListPins({}));
    expect(restored.result.current.getRepoSortAnchorAt("/repo/a")).toBe(
      parsed.repos?.["repo:/repo/a"],
    );
    expect(restored.result.current.getRepoSortAnchorAt("/repo/b")).toBe(
      parsed.repos?.["repo:/repo/b"],
    );
  });

  it("touches pane pin and triggers onTouchPane callback", async () => {
    const onTouchPane = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSessionListPins({
        onTouchPane,
      }),
    );

    act(() => {
      result.current.touchPanePin("%1");
    });

    expect(onTouchPane).toHaveBeenCalledWith("%1");
    expect(result.current.getRepoSortAnchorAt("/repo/a")).toBeNull();
  });
});
