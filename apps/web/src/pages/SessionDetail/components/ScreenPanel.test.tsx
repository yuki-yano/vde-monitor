// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ScreenPanel } from "./ScreenPanel";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data = [],
    itemContent,
  }: {
    data?: string[];
    itemContent: (index: number, item: string) => ReactNode;
  }) => (
    <div data-testid="virtuoso">
      {data.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}));

describe("ScreenPanel", () => {
  type ScreenPanelState = Parameters<typeof ScreenPanel>[0]["state"];
  type ScreenPanelActions = Parameters<typeof ScreenPanel>[0]["actions"];

  const buildState = (overrides: Partial<ScreenPanelState> = {}): ScreenPanelState => ({
    mode: "text",
    connectionIssue: null,
    fallbackReason: null,
    error: null,
    pollingPauseReason: null,
    promptGitContext: {
      branch: "feature/session-detail",
      fileChanges: {
        add: 1,
        m: 2,
        d: 1,
      },
      additions: 18,
      deletions: 6,
    },
    contextLeftLabel: null,
    isScreenLoading: false,
    imageBase64: null,
    screenLines: ["line"],
    virtuosoRef: { current: null },
    scrollerRef: { current: null },
    isAtBottom: true,
    forceFollow: false,
    rawMode: false,
    allowDangerKeys: false,
    fileResolveError: null,
    worktreeSelectorEnabled: false,
    worktreeSelectorLoading: false,
    worktreeSelectorError: null,
    worktreeEntries: [],
    worktreeRepoRoot: null,
    worktreeBaseBranch: null,
    actualWorktreePath: null,
    virtualWorktreePath: null,
    ...overrides,
  });

  const buildActions = (overrides: Partial<ScreenPanelActions> = {}): ScreenPanelActions => ({
    onModeChange: vi.fn(),
    onRefresh: vi.fn(),
    onAtBottomChange: vi.fn(),
    onScrollToBottom: vi.fn(),
    onUserScrollStateChange: vi.fn(),
    onResolveFileReference: vi.fn(async () => undefined),
    onResolveFileReferenceCandidates: vi.fn(async (rawTokens: string[]) => rawTokens),
    ...overrides,
  });

  it("shows raw indicator when enabled", () => {
    const state = buildState({ rawMode: true, allowDangerKeys: true });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("Raw")).toBeTruthy();
    expect(screen.getByText("Unsafe")).toBeTruthy();
  });

  it("renders fallback and error messages", () => {
    const state = buildState({ fallbackReason: "image_failed", error: "Screen error" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("Image fallback: image_failed")).toBeTruthy();
    expect(screen.getByText("Screen error")).toBeTruthy();
  });

  it("hides duplicate connection errors", () => {
    const state = buildState({
      connectionIssue: "Disconnected. Reconnecting...",
      error: "Disconnected. Reconnecting...",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.queryByText("Disconnected. Reconnecting...")).toBeNull();
  });

  it("shows prompt git context row", () => {
    const state = buildState();
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("feature/session-detail")).toBeTruthy();
    expect(screen.getByText("A 1")).toBeTruthy();
    expect(screen.getByText("M 2")).toBeTruthy();
    expect(screen.getByText("D 1")).toBeTruthy();
    expect(screen.getByText("+18")).toBeTruthy();
    expect(screen.getByText("-6")).toBeTruthy();
    expect(screen.getByTestId("prompt-git-context-row")).toBeTruthy();
  });

  it("shows file-change categories as A/M/D without zero entries", () => {
    const state = buildState({
      promptGitContext: {
        branch: "feature/session-detail",
        fileChanges: {
          add: 0,
          m: 3,
          d: 0,
        },
        additions: 10,
        deletions: 1,
      },
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.queryByText("A 0")).toBeNull();
    expect(screen.getByText("M 3")).toBeTruthy();
    expect(screen.queryByText("D 0")).toBeNull();
  });

  it("shows context-left label when available", () => {
    const state = buildState({ contextLeftLabel: "73% context left" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const gitRow = screen.getByTestId("prompt-git-context-row");
    expect(gitRow.textContent).toContain("73% context left");
  });

  it("shows worktree path as relative path with decorated status labels", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeRepoRoot: "/repo",
      worktreeEntries: [
        {
          path: "/repo/worktree-a",
          branch: "feature/worktree-a",
          dirty: true,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          prStatus: "open",
          ahead: 2,
          behind: 1,
          fileChanges: {
            add: 2,
            m: 3,
            d: 1,
          },
          additions: 27,
          deletions: 4,
        },
      ],
      actualWorktreePath: "/repo/worktree-a",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));

    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    expect(within(selectorPanel).getByText("worktree-a")).toBeTruthy();
    expect(within(selectorPanel).queryByText("/repo/worktree-a")).toBeNull();
    expect(within(selectorPanel).getByText("A 2")).toBeTruthy();
    expect(within(selectorPanel).getByText("M 3")).toBeTruthy();
    expect(within(selectorPanel).getByText("D 1")).toBeTruthy();
    expect(within(selectorPanel).getByText("+27")).toBeTruthy();
    expect(within(selectorPanel).getByText("-4")).toBeTruthy();
    const aheadBadge = within(selectorPanel).getByText("Ahead 2");
    const behindBadge = within(selectorPanel).getByText("Behind 1");
    const dirtyBadge = within(selectorPanel).getByText("Dirty Yes");
    expect(aheadBadge).toBeTruthy();
    expect(behindBadge).toBeTruthy();
    expect(dirtyBadge).toBeTruthy();
    expect(
      aheadBadge.compareDocumentPosition(dirtyBadge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(within(selectorPanel).getByText("Locked No")).toBeTruthy();
    expect(within(selectorPanel).getByText("PR Open")).toBeTruthy();
    expect(within(selectorPanel).getByText("Merged No")).toBeTruthy();
    expect(within(selectorPanel).getByText("Current")).toBeTruthy();
  });

  it("maps PR pill labels for all vw statuses", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeRepoRoot: "/repo",
      worktreeEntries: [
        {
          path: "/repo/worktree-none",
          branch: "feature/none",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          prStatus: "none",
          fileChanges: { add: 0, m: 0, d: 0 },
          additions: 0,
          deletions: 0,
        },
        {
          path: "/repo/worktree-merged",
          branch: "feature/merged",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: true,
          prStatus: "merged",
          fileChanges: { add: 0, m: 0, d: 0 },
          additions: 0,
          deletions: 0,
        },
        {
          path: "/repo/worktree-closed",
          branch: "feature/closed",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          prStatus: "closed_unmerged",
          fileChanges: { add: 0, m: 0, d: 0 },
          additions: 0,
          deletions: 0,
        },
        {
          path: "/repo/worktree-unknown",
          branch: "feature/unknown",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          prStatus: "unknown",
          fileChanges: { add: 0, m: 0, d: 0 },
          additions: 0,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo/worktree-none",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));

    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    expect(within(selectorPanel).getByText("PR None")).toBeTruthy();
    expect(within(selectorPanel).getByText("PR Merged")).toBeTruthy();
    expect(within(selectorPanel).getByText("PR Closed")).toBeTruthy();
    expect(within(selectorPanel).getByText("PR Unknown")).toBeTruthy();
  });

  it("does not render dot path for repo-root worktree", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeRepoRoot: "/repo",
      worktreeBaseBranch: "main",
      worktreeEntries: [
        {
          path: "/repo",
          branch: "main",
          dirty: true,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          ahead: 4,
          behind: 2,
          fileChanges: {
            add: 0,
            m: 1,
            d: 0,
          },
          additions: 2,
          deletions: 1,
        },
      ],
      actualWorktreePath: "/repo",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));

    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    expect(within(selectorPanel).getByText("Repo Root")).toBeTruthy();
    expect(within(selectorPanel).queryByText("Ahead 4")).toBeNull();
    expect(within(selectorPanel).queryByText("Behind 2")).toBeNull();
    expect(within(selectorPanel).queryByText("Locked No")).toBeNull();
    expect(within(selectorPanel).queryByText("PR Open")).toBeNull();
    expect(within(selectorPanel).queryByText("Merged No")).toBeNull();
    expect(within(selectorPanel).queryByText(".")).toBeNull();
  });

  it("uses shared truncation component for repo-root branch label", () => {
    const repoRootBranch = "feature/very-long-repo-root-branch-name-for-leading-truncate-check";
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeRepoRoot: "/repo",
      worktreeEntries: [
        {
          path: "/repo",
          branch: repoRootBranch,
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 0,
            m: 0,
            d: 0,
          },
          additions: 0,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));

    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    const branchLabel = within(selectorPanel).getByTitle(repoRootBranch);
    expect(branchLabel.className).toContain("overflow-hidden");
    expect(branchLabel.className).not.toContain("[direction:rtl]");
  });

  it("shows repo-root entry first", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeRepoRoot: "/repo",
      worktreeEntries: [
        {
          path: "/repo/feature-a",
          branch: "feature/a",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 1,
            m: 0,
            d: 0,
          },
          additions: 1,
          deletions: 0,
        },
        {
          path: "/repo",
          branch: "main",
          dirty: true,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: true,
          fileChanges: {
            add: 0,
            m: 1,
            d: 0,
          },
          additions: 2,
          deletions: 1,
        },
      ],
      actualWorktreePath: "/repo",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));

    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    const repoRootButton = within(selectorPanel).getByText("Repo Root").closest("button");
    const featureButton = within(selectorPanel).getByTitle("feature/a").closest("button");
    expect(repoRootButton).toBeTruthy();
    expect(featureButton).toBeTruthy();
    expect(
      repoRootButton!.compareDocumentPosition(featureButton!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("updates body dataset while worktree selector is open", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeEntries: [
        {
          path: "/repo",
          branch: "main",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 0,
            m: 1,
            d: 0,
          },
          additions: 1,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo",
    });
    const actions = buildActions();
    const view = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(document.body.dataset.vdeWorktreeSelectorOpen).toBeUndefined();
    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
    expect(document.body.dataset.vdeWorktreeSelectorOpen).toBe("true");

    fireEvent.click(screen.getByLabelText("Close worktree selector"));
    expect(document.body.dataset.vdeWorktreeSelectorOpen).toBeUndefined();

    view.unmount();
    expect(document.body.dataset.vdeWorktreeSelectorOpen).toBeUndefined();
  });

  it("reloads worktrees from selector header", () => {
    const onRefresh = vi.fn();
    const onRefreshWorktrees = vi.fn();
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeEntries: [
        {
          path: "/repo",
          branch: "main",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 0,
            m: 0,
            d: 0,
          },
          additions: 0,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo",
    });
    const actions = buildActions({ onRefresh, onRefreshWorktrees });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    fireEvent.click(within(selectorPanel).getByLabelText("Reload worktrees"));

    expect(onRefreshWorktrees).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("keeps showing existing worktree entries while loading", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeSelectorLoading: true,
      worktreeRepoRoot: "/repo",
      worktreeEntries: [
        {
          path: "/repo/feature-a",
          branch: "feature/a",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 0,
            m: 0,
            d: 0,
          },
          additions: 0,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo/feature-a",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    expect(within(selectorPanel).getByTitle("feature/a")).toBeTruthy();
    expect(within(selectorPanel).queryByText("Loading worktrees...")).toBeNull();
  });

  it("does not spin reload icon while loading", () => {
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeSelectorLoading: true,
      worktreeEntries: [
        {
          path: "/repo",
          branch: "main",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 0,
            m: 0,
            d: 0,
          },
          additions: 0,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
    const selectorPanel = screen.getByTestId("worktree-selector-panel");
    const reloadButton = within(selectorPanel).getByLabelText("Reload worktrees");
    const iconClassName = reloadButton.querySelector("svg")?.getAttribute("class") ?? "";
    expect(iconClassName).not.toContain("animate-spin");
  });

  it("auto-refreshes worktrees every 10 seconds only while selector is open", async () => {
    vi.useFakeTimers();
    try {
      const onRefreshWorktrees = vi.fn();
      const state = buildState({
        worktreeSelectorEnabled: true,
        worktreeEntries: [
          {
            path: "/repo",
            branch: "main",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
            fileChanges: {
              add: 0,
              m: 0,
              d: 0,
            },
            additions: 0,
            deletions: 0,
          },
        ],
        actualWorktreePath: "/repo",
      });
      const actions = buildActions({ onRefreshWorktrees });
      render(<ScreenPanel state={state} actions={actions} controls={null} />);

      fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
      expect(onRefreshWorktrees).toHaveBeenCalledTimes(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(onRefreshWorktrees).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText("Close worktree selector"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(onRefreshWorktrees).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes worktrees immediately when reopened after being closed for 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      const onRefreshWorktrees = vi.fn();
      const state = buildState({
        worktreeSelectorEnabled: true,
        worktreeEntries: [
          {
            path: "/repo",
            branch: "main",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
            fileChanges: {
              add: 0,
              m: 0,
              d: 0,
            },
            additions: 0,
            deletions: 0,
          },
        ],
        actualWorktreePath: "/repo",
      });
      const actions = buildActions({ onRefreshWorktrees });
      render(<ScreenPanel state={state} actions={actions} controls={null} />);

      fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
      fireEvent.click(screen.getByLabelText("Close worktree selector"));
      expect(onRefreshWorktrees).toHaveBeenCalledTimes(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      fireEvent.click(screen.getByTestId("worktree-selector-trigger"));
      expect(onRefreshWorktrees).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders virtual badge on the right of worktree name", () => {
    const onClearVirtualWorktree = vi.fn();
    const state = buildState({
      worktreeSelectorEnabled: true,
      worktreeRepoRoot: "/repo",
      worktreeEntries: [
        {
          path: "/repo/worktree-a",
          branch: "feature/worktree-a",
          dirty: false,
          locked: false,
          lockOwner: null,
          lockReason: null,
          merged: false,
          fileChanges: {
            add: 0,
            m: 1,
            d: 0,
          },
          additions: 1,
          deletions: 0,
        },
      ],
      actualWorktreePath: "/repo",
      virtualWorktreePath: "/repo/worktree-a",
      promptGitContext: {
        branch: "feature/very-long-branch-name-for-virtual-worktree-layout-check",
        fileChanges: {
          add: 0,
          m: 1,
          d: 0,
        },
        additions: 1,
        deletions: 0,
      },
    });
    const actions = buildActions({ onClearVirtualWorktree });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const clearButton = screen.getByLabelText("Clear virtual worktree");
    const worktreeTrigger = screen.getByTestId("worktree-selector-trigger");
    const virtualBadge = screen.getByTitle("Virtual worktree active");
    expect(
      clearButton.compareDocumentPosition(worktreeTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      worktreeTrigger.compareDocumentPosition(virtualBadge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(virtualBadge.textContent).toBe("Virt");

    fireEvent.click(clearButton);
    expect(onClearVirtualWorktree).toHaveBeenCalled();
  });

  it("shows polling pause indicator on second row and keeps context on first row", () => {
    const state = buildState({
      pollingPauseReason: "offline",
      contextLeftLabel: "73% context left",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const gitRow = screen.getByTestId("prompt-git-context-row");
    const statusRow = screen.getByTestId("prompt-status-row");
    expect(gitRow.textContent).toContain("73% context left");
    expect(statusRow.textContent).toContain("PAUSED (offline)");
    expect(statusRow.textContent).not.toContain("73% context left");
    expect(screen.getByText("PAUSED (offline)")).toBeTruthy();
  });

  it("shows reconnecting indicator when disconnected", () => {
    const state = buildState({ pollingPauseReason: "disconnected" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("RECONNECTING...")).toBeTruthy();
  });

  it("renders image mode content", () => {
    const state = buildState({
      mode: "image",
      imageBase64: "abc123",
      screenLines: [],
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const img = screen.getByAltText("screen") as HTMLImageElement;
    expect(img.src).toContain("data:image/png;base64,abc123");
  });

  it("shows scroll-to-bottom button when not at bottom", () => {
    const onScrollToBottom = vi.fn();
    const state = buildState({ isAtBottom: false });
    const actions = buildActions({ onScrollToBottom });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByLabelText("Scroll to bottom"));
    expect(onScrollToBottom).toHaveBeenCalledWith("smooth");
  });

  it("invokes refresh handler", () => {
    const onRefresh = vi.fn();
    const state = buildState();
    const actions = buildActions({ onRefresh });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const buttons = screen.queryAllByLabelText("Refresh screen");
    const first = buttons[0];
    expect(first).toBeTruthy();
    fireEvent.click(first as Element);
    expect(onRefresh).toHaveBeenCalled();
  });

  it("sanitizes copied log text", () => {
    const selection = { toString: () => "line\u0007bell" } as unknown as Selection;
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue(selection);
    const setData = vi.fn();
    const state = buildState();
    const actions = buildActions();

    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const container = screen.getByTestId("virtuoso").parentElement;
    expect(container).toBeTruthy();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { setData } });
    container?.dispatchEvent(event);

    expect(setData).toHaveBeenCalledWith("text/plain", "linebell");
    expect(event.defaultPrevented).toBe(true);
    getSelectionSpy.mockRestore();
  });

  it("shows file resolve error", () => {
    const state = buildState({ fileResolveError: "No file matched: index.ts" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("No file matched: index.ts")).toBeTruthy();
  });

  it("resolves file reference when clicking linkified token", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["failed at src/main.ts(10,2):"],
    });
    const actions = buildActions({ onResolveFileReference, onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });
    let ref: HTMLElement | null = null;
    await waitFor(() => {
      ref = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts(10,2):']");
      expect(ref).toBeTruthy();
    });
    if (!ref) {
      throw new Error("expected linkified file reference");
    }
    fireEvent.click(ref);

    await waitFor(() => {
      expect(onResolveFileReference).toHaveBeenCalledWith("src/main.ts(10,2):");
    });
  });

  it("resolves file reference when pressing Enter on linkified token", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["failed at src/main.ts:3"],
    });
    const actions = buildActions({ onResolveFileReference, onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });
    let ref: HTMLElement | null = null;
    await waitFor(() => {
      ref = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts:3']");
      expect(ref).toBeTruthy();
    });
    if (!ref) {
      throw new Error("expected linkified file reference");
    }
    fireEvent.keyDown(ref, { key: "Enter" });

    await waitFor(() => {
      expect(onResolveFileReference).toHaveBeenCalledWith("src/main.ts:3");
    });
  });

  it("does not linkify non-existing file references", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async () => []);
    const state = buildState({
      screenLines: ["failed at src/missing.ts:12"],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });
    expect(container.querySelector("[data-vde-file-ref]")).toBeNull();
  });

  it("renders link without underline class", async () => {
    const state = buildState({
      screenLines: ["see src/main.ts:1"],
    });
    const actions = buildActions();
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      const ref = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts:1']");
      expect(ref).toBeTruthy();
      expect(ref?.className.includes("underline")).toBe(false);
    });
  });

  it("does not persist hovered highlight class across rerender", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const actions = buildActions({ onResolveFileReferenceCandidates });
    const { container, rerender } = render(
      <ScreenPanel
        state={buildState({
          screenLines: ["see src/main.ts:1"],
        })}
        actions={actions}
        controls={null}
      />,
    );

    let initialRef: HTMLElement | null = null;
    await waitFor(() => {
      initialRef = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts:1']");
      expect(initialRef).toBeTruthy();
    });
    if (!initialRef) {
      throw new Error("expected linkified file reference");
    }
    fireEvent.mouseMove(initialRef);

    await waitFor(() => {
      const hoveredRef = container.querySelector<HTMLElement>(
        "[data-vde-file-ref='src/main.ts:1']",
      );
      const classList = new Set((hoveredRef?.className ?? "").split(/\s+/).filter(Boolean));
      expect(classList.has("text-latte-lavender")).toBe(false);
    });

    rerender(
      <ScreenPanel
        state={buildState({
          screenLines: ["again src/main.ts:1"],
        })}
        actions={actions}
        controls={null}
      />,
    );

    await waitFor(() => {
      const rerenderedRef = container.querySelector<HTMLElement>(
        "[data-vde-file-ref='src/main.ts:1']",
      );
      expect(rerenderedRef).toBeTruthy();
      const classList = new Set((rerenderedRef?.className ?? "").split(/\s+/).filter(Boolean));
      expect(classList.has("text-latte-lavender")).toBe(false);
    });
  });

  it("passes raw token candidates to resolver", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["aaa src/main.ts:1 index.test.tsx https://example.com"],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalledWith([
        "src/main.ts:1",
        "index.test.tsx",
      ]);
    });
  });

  it("re-resolves candidates when resolver callback changes", async () => {
    const initialResolver = vi.fn(async () => []);
    const nextResolver = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["src/main.ts:1"],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates: initialResolver });
    const { container, rerender } = render(
      <ScreenPanel state={state} actions={actions} controls={null} />,
    );

    await waitFor(() => {
      expect(initialResolver).toHaveBeenCalledWith(["src/main.ts:1"]);
    });
    expect(container.querySelector("[data-vde-file-ref='src/main.ts:1']")).toBeNull();

    rerender(
      <ScreenPanel
        state={state}
        actions={buildActions({ onResolveFileReferenceCandidates: nextResolver })}
        controls={null}
      />,
    );

    await waitFor(() => {
      expect(nextResolver).toHaveBeenCalledWith(["src/main.ts:1"]);
      expect(container.querySelector("[data-vde-file-ref='src/main.ts:1']")).toBeTruthy();
    });
  });

  it("passes all visible-range candidates without token cap", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const manyTokens = Array.from({ length: 180 }, (_, index) => `file-${index}.ts`).join(" ");
    const state = buildState({
      screenLines: [manyTokens],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });

    const firstCallArgs = onResolveFileReferenceCandidates.mock.calls[0]?.[0] as
      | string[]
      | undefined;
    expect(firstCallArgs?.length).toBe(180);
    expect(firstCallArgs?.[0]).toBe("file-0.ts");
    expect(firstCallArgs?.at(-1)).toBe("file-179.ts");
  });

  it("invokes file resolver only for verified links", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async () => ["src/exists.ts:2"]);
    const state = buildState({
      screenLines: ["src/missing.ts:1 src/exists.ts:2"],
    });
    const actions = buildActions({ onResolveFileReference, onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(container.querySelector("[data-vde-file-ref='src/missing.ts:1']")).toBeNull();
      expect(container.querySelector("[data-vde-file-ref='src/exists.ts:2']")).toBeTruthy();
    });

    fireEvent.click(container.querySelector("[data-vde-file-ref='src/exists.ts:2']") as Element);
    expect(onResolveFileReference).toHaveBeenCalledWith("src/exists.ts:2");
  });

  it("linkifies comma-separated filename tokens in explored logs", async () => {
    const state = buildState({
      screenLines: ["└ Read SessionDetailView.test.tsx, useSessionDetailVM.test.tsx"],
    });
    const actions = buildActions();
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(
        container.querySelector("[data-vde-file-ref='SessionDetailView.test.tsx,']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-vde-file-ref='useSessionDetailVM.test.tsx']"),
      ).toBeTruthy();
    });
  });

  it("keeps existing verified links when follow-up candidate resolution returns empty", async () => {
    const onResolveFileReferenceCandidates = vi
      .fn<ScreenPanelActions["onResolveFileReferenceCandidates"]>()
      .mockImplementationOnce(async (rawTokens) => rawTokens)
      .mockImplementationOnce(async () => []);
    const actions = buildActions({ onResolveFileReferenceCandidates });
    const { container, rerender } = render(
      <ScreenPanel
        state={buildState({
          screenLines: ["└ Read SessionDetailView.test.tsx, useSessionDetailVM.test.tsx"],
        })}
        actions={actions}
        controls={null}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector("[data-vde-file-ref='SessionDetailView.test.tsx,']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-vde-file-ref='useSessionDetailVM.test.tsx']"),
      ).toBeTruthy();
    });

    rerender(
      <ScreenPanel
        state={buildState({
          screenLines: [
            "• Explored",
            "└ Read SessionDetailView.test.tsx, useSessionDetailVM.test.tsx",
          ],
        })}
        actions={actions}
        controls={null}
      />,
    );

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-vde-file-ref='SessionDetailView.test.tsx,']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-vde-file-ref='useSessionDetailVM.test.tsx']"),
      ).toBeTruthy();
    });
  });
});
