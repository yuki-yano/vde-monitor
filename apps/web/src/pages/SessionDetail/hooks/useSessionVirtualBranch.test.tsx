import { act, renderHook, waitFor } from "@testing-library/react";
import type { BranchList, BranchListEntry } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { useSessionVirtualBranch } from "./useSessionVirtualBranch";

const STORAGE_KEY_PREFIX = "vde-monitor:virtual-branch:v1";

const buildStorageKey = (paneId: string) => `${STORAGE_KEY_PREFIX}:${paneId}`;

const createBranchEntry = (overrides: Partial<BranchListEntry> = {}): BranchListEntry => ({
  name: "feature/a",
  current: false,
  isDefault: false,
  ahead: null,
  behind: null,
  fileChanges: null,
  additions: null,
  deletions: null,
  merged: null,
  pr: null,
  worktreePath: null,
  committedAt: null,
  ...overrides,
});

const createBranchList = (overrides: Partial<BranchList> = {}): BranchList => ({
  repoRoot: "/tmp/repo-a",
  defaultBranch: "main",
  currentBranch: "main",
  entries: [
    createBranchEntry({ name: "main", current: true, isDefault: true }),
    createBranchEntry({ name: "feature/a" }),
  ],
  ...overrides,
});

describe("useSessionVirtualBranch", () => {
  it("selects a virtual branch and persists it to pane-scoped storage", async () => {
    const paneId = "pane-1";
    const branchList = createBranchList();
    const { result } = renderHook(() => useSessionVirtualBranch({ paneId, branchList }));

    act(() => {
      result.current.selectVirtualBranch("feature/a");
    });

    expect(result.current.virtualBranch).toBe("feature/a");
    await waitFor(() => {
      expect(window.localStorage.getItem(buildStorageKey(paneId))).toContain("feature/a");
    });
  });

  it("clears selection when selecting the default branch (no-op selection)", async () => {
    const paneId = "pane-1";
    const branchList = createBranchList({ defaultBranch: "main" });
    const { result } = renderHook(() => useSessionVirtualBranch({ paneId, branchList }));

    act(() => {
      result.current.selectVirtualBranch("feature/a");
    });
    expect(result.current.virtualBranch).toBe("feature/a");

    act(() => {
      result.current.selectVirtualBranch("main");
    });

    expect(result.current.virtualBranch).toBeNull();
    expect(window.localStorage.getItem(buildStorageKey(paneId))).toBeNull();
  });

  it("clears virtual branch and removes stored selection via clearVirtualBranch", async () => {
    const paneId = "pane-1";
    const branchList = createBranchList();
    const { result } = renderHook(() => useSessionVirtualBranch({ paneId, branchList }));

    act(() => {
      result.current.selectVirtualBranch("feature/a");
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(buildStorageKey(paneId))).toContain("feature/a");
    });

    act(() => {
      result.current.clearVirtualBranch();
    });

    expect(result.current.virtualBranch).toBeNull();
    expect(window.localStorage.getItem(buildStorageKey(paneId))).toBeNull();
  });

  it("clears selection automatically when the branch disappears from the list", async () => {
    const paneId = "pane-1";
    const repoRoot = "/tmp/repo-a";
    const { result, rerender } = renderHook(
      ({ branchList }: { branchList: BranchList }) =>
        useSessionVirtualBranch({ paneId, branchList }),
      { initialProps: { branchList: createBranchList({ repoRoot }) } },
    );

    act(() => {
      result.current.selectVirtualBranch("feature/a");
    });
    expect(result.current.virtualBranch).toBe("feature/a");
    await waitFor(() => {
      expect(window.localStorage.getItem(buildStorageKey(paneId))).toContain("feature/a");
    });

    rerender({
      branchList: createBranchList({
        repoRoot,
        entries: [createBranchEntry({ name: "main", current: true, isDefault: true })],
      }),
    });

    await waitFor(() => {
      expect(result.current.virtualBranch).toBeNull();
    });
    expect(window.localStorage.getItem(buildStorageKey(paneId))).toBeNull();
  });

  it("discards stored selection when repoRoot differs from the current branch list", async () => {
    const paneId = "pane-1";
    const staleRepoRoot = "/tmp/repo-old";
    const currentRepoRoot = "/tmp/repo-new";
    window.localStorage.setItem(
      buildStorageKey(paneId),
      JSON.stringify({
        repoRoot: staleRepoRoot,
        branch: "feature/a",
        updatedAt: new Date(0).toISOString(),
      }),
    );
    const branchList = createBranchList({ repoRoot: currentRepoRoot });
    const { result } = renderHook(() => useSessionVirtualBranch({ paneId, branchList }));

    await waitFor(() => {
      expect(window.localStorage.getItem(buildStorageKey(paneId))).toBeNull();
    });
    expect(result.current.virtualBranch).toBeNull();
  });
});
