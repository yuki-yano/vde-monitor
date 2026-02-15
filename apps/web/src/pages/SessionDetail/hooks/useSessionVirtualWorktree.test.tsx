// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { WorktreeList } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { createSessionDetail } from "../test-helpers";
import { useSessionVirtualWorktree } from "./useSessionVirtualWorktree";

const STORAGE_KEY_PREFIX = "vde-monitor:virtual-worktree:v1";

const buildStorageKey = (paneId: string) => `${STORAGE_KEY_PREFIX}:${paneId}`;

const createWorktreeList = (repoRoot: string): WorktreeList => ({
  repoRoot,
  currentPath: `${repoRoot}/main`,
  entries: [
    {
      path: `${repoRoot}/main`,
      branch: "main",
      dirty: false,
      locked: false,
      lockOwner: null,
      lockReason: null,
      merged: false,
    },
    {
      path: `${repoRoot}/feature-a`,
      branch: "feature/a",
      dirty: true,
      locked: false,
      lockOwner: null,
      lockReason: null,
      merged: false,
    },
  ],
});

const createEmptyWorktreeList = (repoRoot: string): WorktreeList => ({
  repoRoot,
  currentPath: `${repoRoot}/main`,
  entries: [],
});

describe("useSessionVirtualWorktree", () => {
  it("hydrates virtual selection from pane-scoped storage on initial load", async () => {
    const repoRoot = "/tmp/repo-a";
    const paneId = "pane-1";
    window.localStorage.setItem(
      buildStorageKey(paneId),
      JSON.stringify({
        repoRoot,
        worktreePath: `${repoRoot}/feature-a`,
        branch: "feature/a",
        updatedAt: new Date(0).toISOString(),
      }),
    );
    const requestWorktrees = vi.fn(async () => createWorktreeList(repoRoot));
    const { result } = renderHook(
      ({ paneId, session }: { paneId: string; session: ReturnType<typeof createSessionDetail> }) =>
        useSessionVirtualWorktree({
          paneId,
          session,
          requestWorktrees,
        }),
      {
        initialProps: {
          paneId,
          session: createSessionDetail({
            paneId,
            repoRoot,
            worktreePath: `${repoRoot}/main`,
            branch: "main",
          }),
        },
      },
    );

    await waitFor(() => {
      expect(result.current.virtualWorktreePath).toBe(`${repoRoot}/feature-a`);
    });
  });

  it("does not hydrate virtual selection from another pane storage", async () => {
    const repoRoot = "/tmp/repo-x";
    window.localStorage.setItem(
      buildStorageKey("pane-1"),
      JSON.stringify({
        repoRoot,
        worktreePath: `${repoRoot}/feature-a`,
        branch: "feature/a",
        updatedAt: new Date(0).toISOString(),
      }),
    );
    const requestWorktrees = vi.fn(async () => createWorktreeList(repoRoot));
    const { result } = renderHook(() =>
      useSessionVirtualWorktree({
        paneId: "pane-2",
        session: createSessionDetail({
          paneId: "pane-2",
          repoRoot,
          worktreePath: `${repoRoot}/main`,
          branch: "main",
        }),
        requestWorktrees,
      }),
    );

    await waitFor(() => {
      expect(requestWorktrees).toHaveBeenCalledWith("pane-2");
    });
    expect(result.current.virtualWorktreePath).toBeNull();
  });

  it("clears pane-scoped storage when clearing virtual worktree", async () => {
    const repoRoot = "/tmp/repo-b";
    const paneId = "pane-1";
    const requestWorktrees = vi.fn(async () => createWorktreeList(repoRoot));
    const { result } = renderHook(() =>
      useSessionVirtualWorktree({
        paneId,
        session: createSessionDetail({
          paneId,
          repoRoot,
          worktreePath: `${repoRoot}/main`,
          branch: "main",
        }),
        requestWorktrees,
      }),
    );

    await waitFor(() => {
      expect(requestWorktrees).toHaveBeenCalledWith(paneId);
    });

    act(() => {
      result.current.selectVirtualWorktree(`${repoRoot}/feature-a`);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(buildStorageKey(paneId))).toContain(
        `${repoRoot}/feature-a`,
      );
    });

    act(() => {
      result.current.clearVirtualWorktree();
    });

    expect(window.localStorage.getItem(buildStorageKey(paneId))).toBeNull();
  });

  it("resets stale entries when worktree loading fails after pane switch", async () => {
    const requestWorktrees = vi.fn(async (paneId: string) => {
      if (paneId === "pane-1") {
        return createWorktreeList("/tmp/repo-a");
      }
      throw new Error("worktree api failed");
    });

    const { result, rerender } = renderHook(
      ({ paneId, repoRoot }: { paneId: string; repoRoot: string }) =>
        useSessionVirtualWorktree({
          paneId,
          session: createSessionDetail({
            paneId,
            repoRoot,
            worktreePath: `${repoRoot}/main`,
            branch: "main",
          }),
          requestWorktrees,
        }),
      {
        initialProps: {
          paneId: "pane-1",
          repoRoot: "/tmp/repo-a",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.entries.length).toBeGreaterThan(0);
    });

    rerender({
      paneId: "pane-2",
      repoRoot: "/tmp/repo-b",
    });

    await waitFor(() => {
      expect(result.current.error).toContain("worktree api failed");
    });
    expect(result.current.entries).toEqual([]);
  });

  it("keeps stored virtual selection when worktree list is temporarily empty", async () => {
    const repoRoot = "/tmp/repo-c";
    const paneId = "pane-1";
    window.localStorage.setItem(
      buildStorageKey(paneId),
      JSON.stringify({
        repoRoot,
        worktreePath: `${repoRoot}/feature-a`,
        branch: "feature/a",
        updatedAt: new Date(0).toISOString(),
      }),
    );
    const requestWorktreesReady = vi.fn(async () => createWorktreeList(repoRoot));
    const requestWorktreesEmpty = vi.fn(async () => createEmptyWorktreeList(repoRoot));
    const { result, rerender } = renderHook(
      ({ requestWorktrees }: { requestWorktrees: (paneId: string) => Promise<WorktreeList> }) =>
        useSessionVirtualWorktree({
          paneId,
          session: createSessionDetail({
            paneId,
            repoRoot,
            worktreePath: `${repoRoot}/main`,
            branch: "main",
          }),
          requestWorktrees,
        }),
      {
        initialProps: {
          requestWorktrees: requestWorktreesReady,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.virtualWorktreePath).toBe(`${repoRoot}/feature-a`);
    });

    rerender({
      requestWorktrees: requestWorktreesEmpty,
    });

    await waitFor(() => {
      expect(result.current.entries).toEqual([]);
    });
    expect(result.current.virtualWorktreePath).toBe(`${repoRoot}/feature-a`);
    expect(window.localStorage.getItem(buildStorageKey(paneId))).toContain(`${repoRoot}/feature-a`);
  });
});
