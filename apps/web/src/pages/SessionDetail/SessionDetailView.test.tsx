import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MutableRefObject, ReactNode } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { buildSessionGroups } from "@/lib/session-group";
import { ThemeProvider } from "@/state/theme-context";

import { SessionDetailView, type SessionDetailViewProps } from "./SessionDetailView";
import { createSessionDetail } from "./test-helpers";

vi.mock("./components/SessionSidebar", () => ({
  SessionSidebar: () => <div data-testid="session-sidebar" />,
}));

const DETAIL_SECTION_TAB_STORAGE_KEY = "vde-monitor-session-detail-section-tab";
const CLOSE_DETAIL_TAB_VALUE = "__close__";
const SECTION_TAB_STORAGE_REPO_FALLBACK = "__unknown_repo__";
const SECTION_TAB_STORAGE_BRANCH_FALLBACK = "__no_branch__";

const buildSectionTabStorageKey = (scope: { branch?: null | string; repoRoot?: null | string }) =>
  `${DETAIL_SECTION_TAB_STORAGE_KEY}:${encodeURIComponent(scope.repoRoot ?? SECTION_TAB_STORAGE_REPO_FALLBACK)}:${encodeURIComponent(scope.branch ?? SECTION_TAB_STORAGE_BRANCH_FALLBACK)}`;

const renderWithRouter = (ui: ReactNode) => {
  const rootRoute = createRootRoute({
    component: () => null,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <RouterContextProvider router={router}>
      <ThemeProvider>{ui}</ThemeProvider>
    </RouterContextProvider>,
  );
};

type SessionDetailViewOverrides = {
  meta?: Partial<SessionDetailViewProps["meta"]>;
  sidebar?: Partial<SessionDetailViewProps["sidebar"]>;
  layout?: Partial<SessionDetailViewProps["layout"]>;
  timeline?: Partial<SessionDetailViewProps["timeline"]>;
  screen?: Partial<SessionDetailViewProps["screen"]>;
  controls?: Partial<SessionDetailViewProps["controls"]>;
  diffs?: Partial<SessionDetailViewProps["diffs"]>;
  files?: Partial<SessionDetailViewProps["files"]>;
  commits?: Partial<SessionDetailViewProps["commits"]>;
  notes?: Partial<SessionDetailViewProps["notes"]>;
  logs?: Partial<SessionDetailViewProps["logs"]>;
  title?: Partial<SessionDetailViewProps["title"]>;
  actions?: Partial<SessionDetailViewProps["actions"]>;
};

const createViewProps = (overrides: SessionDetailViewOverrides = {}): SessionDetailViewProps => {
  const base: SessionDetailViewProps = {
    meta: {
      paneId: "pane-1",
      session: null,
      nowMs: 0,
      connected: false,
      connectionIssue: null,
    },
    sidebar: {
      sessionGroups: buildSessionGroups([]),
      getRepoSortAnchorAt: () => null,
      connected: false,
      connectionIssue: null,
      launchConfig: {
        agents: {
          codex: { options: [] },
          claude: { options: [] },
        },
      },
      requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
      requestStateTimeline: vi.fn(),
      requestScreen: vi.fn(),
      highlightCorrections: { codex: true, claude: true },
      resolvedTheme: "latte",
    },
    layout: {
      is2xlUp: false,
      sidebarWidth: 240,
      handleSidebarPointerDown: vi.fn(),
      detailSplitRatio: 0.5,
      detailSplitRef: { current: null } as MutableRefObject<HTMLDivElement | null>,
      handleDetailSplitPointerDown: vi.fn(),
    },
    timeline: {
      timeline: null,
      timelineScope: "pane",
      timelineRange: "1h",
      hasRepoTimeline: true,
      timelineError: null,
      timelineLoading: false,
      timelineExpanded: true,
      isMobile: false,
      setTimelineScope: vi.fn(),
      setTimelineRange: vi.fn(),
      toggleTimelineExpanded: vi.fn(),
      refreshTimeline: vi.fn(),
    },
    screen: {
      mode: "text",
      wrapMode: "off",
      screenLines: [],
      imageBase64: null,
      fallbackReason: null,
      error: null,
      pollingPauseReason: null,
      contextLeftLabel: null,
      isScreenLoading: false,
      isAtBottom: true,
      handleAtBottomChange: vi.fn(),
      handleUserScrollStateChange: vi.fn(),
      forceFollow: false,
      scrollToBottom: vi.fn(),
      handleModeChange: vi.fn(),
      toggleWrapMode: vi.fn(),
      virtuosoRef: { current: null } as MutableRefObject<VirtuosoHandle | null>,
      scrollerRef: { current: null } as MutableRefObject<HTMLDivElement | null>,
      handleRefreshScreen: vi.fn(),
      handleRefreshWorktrees: vi.fn(),
      effectiveBranch: null,
      effectiveWorktreePath: null,
      worktreeRepoRoot: null,
      worktreeBaseBranch: null,
      worktreeSelectorEnabled: false,
      worktreeSelectorLoading: false,
      worktreeSelectorError: null,
      worktreeEntries: [],
      actualWorktreePath: null,
      virtualWorktreePath: null,
      selectVirtualWorktree: vi.fn(),
      clearVirtualWorktree: vi.fn(),
    },
    controls: {
      interactive: true,
      isSendingText: false,
      textInputRef: { current: null } as MutableRefObject<HTMLTextAreaElement | null>,
      autoEnter: false,
      shiftHeld: false,
      ctrlHeld: false,
      rawMode: false,
      allowDangerKeys: false,
      handleSendKey: vi.fn(),
      handleKillPane: vi.fn(),
      handleKillWindow: vi.fn(),
      handleSendText: vi.fn(),
      handleUploadImage: vi.fn(),
      handleRawBeforeInput: vi.fn(),
      handleRawInput: vi.fn(),
      handleRawKeyDown: vi.fn(),
      handleRawCompositionStart: vi.fn(),
      handleRawCompositionEnd: vi.fn(),
      toggleAutoEnter: vi.fn(),
      toggleShift: vi.fn(),
      toggleCtrl: vi.fn(),
      toggleRawMode: vi.fn(),
      toggleAllowDangerKeys: vi.fn(),
      handleTouchSession: vi.fn(),
    },
    diffs: {
      diffSummary: null,
      diffError: null,
      diffLoading: false,
      diffFiles: {},
      diffOpen: {},
      diffLoadingFiles: {},
      refreshDiff: vi.fn(),
      toggleDiff: vi.fn(),
      ensureDiffFile: vi.fn(),
    },
    files: {
      unavailable: false,
      selectedFilePath: null,
      searchQuery: "",
      searchActiveIndex: 0,
      searchResult: null,
      searchLoading: false,
      searchError: null,
      searchMode: "all-matches",
      treeLoading: false,
      treeError: null,
      treeNodes: [],
      rootTreeHasMore: false,
      searchHasMore: false,
      fileModalOpen: false,
      fileModalPath: null,
      fileModalLoading: false,
      fileModalError: null,
      fileModalFile: null,
      fileModalMarkdownViewMode: "code",
      fileModalShowLineNumbers: false,
      fileModalCopiedPath: false,
      fileModalCopyError: null,
      fileModalHighlightLine: null,
      fileResolveError: null,
      logFileCandidateModalOpen: false,
      logFileCandidateReference: null,
      logFileCandidatePaneId: null,
      logFileCandidateItems: [],
      onRefresh: vi.fn(),
      onSearchQueryChange: vi.fn(),
      onSearchMove: vi.fn(),
      onSearchConfirm: vi.fn(),
      onToggleDirectory: vi.fn(),
      onSelectFile: vi.fn(),
      onOpenFileModal: vi.fn(),
      onCloseFileModal: vi.fn(),
      onSetFileModalMarkdownViewMode: vi.fn(),
      onToggleFileModalLineNumbers: vi.fn(),
      onCopyFileModalPath: vi.fn(),
      onResolveLogFileReference: vi.fn(async () => undefined),
      onResolveLogFileReferenceCandidates: vi.fn(async () => []),
      onSelectLogFileCandidate: vi.fn(),
      onCloseLogFileCandidateModal: vi.fn(),
      onLoadMoreTreeRoot: vi.fn(),
      onLoadMoreSearch: vi.fn(),
    },
    commits: {
      commitLog: null,
      commitError: null,
      commitLoading: false,
      commitLoadingMore: false,
      commitHasMore: false,
      commitDetails: {},
      commitFileDetails: {},
      commitFileOpen: {},
      commitFileLoading: {},
      commitOpen: {},
      commitLoadingDetails: {},
      copiedHash: null,
      refreshCommitLog: vi.fn(),
      loadMoreCommits: vi.fn(),
      toggleCommit: vi.fn(),
      toggleCommitFile: vi.fn(),
      copyHash: vi.fn(),
    },
    notes: {
      repoRoot: null,
      notes: [],
      notesLoading: false,
      notesError: null,
      creatingNote: false,
      savingNoteId: null,
      deletingNoteId: null,
      refreshNotes: vi.fn(),
      createNote: vi.fn(async () => true),
      saveNote: vi.fn(async () => true),
      removeNote: vi.fn(async () => true),
    },
    logs: {
      quickPanelOpen: false,
      logModalOpen: false,
      selectedSession: null,
      selectedLogLines: [],
      selectedLogLoading: false,
      selectedLogError: null,
      openLogModal: vi.fn(),
      closeLogModal: vi.fn(),
      toggleQuickPanel: vi.fn(),
      closeQuickPanel: vi.fn(),
    },
    title: {
      titleDraft: "",
      titleEditing: false,
      titleSaving: false,
      titleError: null,
      openTitleEditor: vi.fn(),
      closeTitleEditor: vi.fn(),
      updateTitleDraft: vi.fn(),
      saveTitle: vi.fn(),
      resetTitle: vi.fn(),
    },
    actions: {
      handleFocusPane: vi.fn(),
      handleLaunchAgentInSession: vi.fn(async () => undefined),
      handleTouchPane: vi.fn(),
      handleTouchRepoPin: vi.fn(),
      handleOpenPaneHere: vi.fn(),
      handleOpenPaneInNewWindow: vi.fn(),
      handleOpenHere: vi.fn(),
      handleOpenInNewTab: vi.fn(),
    },
  };

  return {
    ...base,
    meta: { ...base.meta, ...overrides.meta },
    sidebar: { ...base.sidebar, ...overrides.sidebar },
    layout: { ...base.layout, ...overrides.layout },
    timeline: { ...base.timeline, ...overrides.timeline },
    screen: { ...base.screen, ...overrides.screen },
    controls: { ...base.controls, ...overrides.controls },
    diffs: { ...base.diffs, ...overrides.diffs },
    files: { ...base.files, ...overrides.files },
    commits: { ...base.commits, ...overrides.commits },
    notes: { ...base.notes, ...overrides.notes },
    logs: { ...base.logs, ...overrides.logs },
    title: { ...base.title, ...overrides.title },
    actions: { ...base.actions, ...overrides.actions },
  };
};

describe("SessionDetailView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders not found state when session remains missing", () => {
    vi.useFakeTimers();
    try {
      const props = createViewProps({ meta: { session: null, connected: true } });
      renderWithRouter(<SessionDetailView {...props} />);

      expect(screen.getByText("Loading session...")).toBeTruthy();
      expect(screen.getByTestId("session-detail-loading-skeleton")).toBeTruthy();
      expect(screen.getByTestId("session-detail-loading-header")).toBeTruthy();
      expect(screen.getByTestId("session-detail-loading-top")).toBeTruthy();
      expect(screen.getByRole("tablist", { name: "Theme selection" })).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      expect(screen.getByText("Session not found.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Back to list" })).toBeTruthy();
      expect(document.title).toBe("VDE Monitor");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps showing loading while initial session fetch is in progress", () => {
    const props = createViewProps({
      meta: { session: null, connected: false, connectionIssue: null },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByText("Loading session...")).toBeTruthy();
    expect(screen.getByTestId("session-detail-loading-skeleton")).toBeTruthy();
    expect(screen.getByTestId("session-detail-loading-header")).toBeTruthy();
    expect(screen.getByTestId("session-detail-loading-top")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Theme selection" })).toBeTruthy();
    expect(screen.queryByText("Session not found.")).toBeNull();
  });

  it("shows authentication error in missing-session state", () => {
    const props = createViewProps({
      meta: { session: null, connectionIssue: API_ERROR_MESSAGES.unauthorized },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByText("Authentication error.")).toBeTruthy();
    expect(screen.getByText(API_ERROR_MESSAGES.unauthorized)).toBeTruthy();
    expect(screen.queryByText("Session not found.")).toBeNull();
  });

  it("shows configuration error cause in missing-session state", () => {
    const cause =
      "invalid config: /tmp/.vde/monitor/config.json activity.pollIntervalMs Invalid input: expected number, received string";
    const props = createViewProps({
      meta: { session: null, connectionIssue: `Request failed (500)\nError cause: ${cause}` },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByText("Configuration error on server.")).toBeTruthy();
    expect(screen.getByText("Request failed (500)")).toBeTruthy();
    expect(screen.getByText(`Error cause: ${cause}`)).toBeTruthy();
    expect(screen.queryByText("Session not found.")).toBeNull();
  });

  it("renders main sections when session exists", () => {
    const props = createViewProps({
      meta: { session: createSessionDetail() },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByRole("button", { name: "Edit session title" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Text" })).toBeTruthy();
    expect(screen.getByText("State Timeline")).toBeTruthy();
    expect(screen.getByText("Changes")).toBeTruthy();
    expect(screen.getByText("File Navigator")).toBeTruthy();
    expect(screen.getByText("Commit Log")).toBeTruthy();
    expect(screen.getByText("Worktrees")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Timeline panel" })).toBeNull();
    expect(screen.getByLabelText("Toggle session quick panel")).toBeTruthy();
    expect(document.title).toBe("Session Title - VDE Monitor");
  });

  it("places desktop worktree pane below commit log", () => {
    const props = createViewProps({
      meta: { session: createSessionDetail() },
      timeline: { isMobile: false },
      screen: { worktreeSelectorEnabled: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    const commitHeading = screen.getByRole("heading", { name: "Commit Log" });
    const worktreeHeading = screen.getByRole("heading", { name: "Worktrees" });
    expect(
      commitHeading.compareDocumentPosition(worktreeHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("switches section by icon tabs and stores selected tab", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const storageKey = buildSectionTabStorageKey({
      repoRoot: session.repoRoot,
      branch: session.branch,
    });
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Changes panel" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Changes panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(window.localStorage.getItem(storageKey)).toBe("changes");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Files panel" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Files panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(window.localStorage.getItem(storageKey)).toBe("file");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Commits panel" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Commits panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(window.localStorage.getItem(storageKey)).toBe("commits");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Worktrees panel" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Worktrees panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(window.localStorage.getItem(storageKey)).toBe("worktrees");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Keys panel" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Keys panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(window.localStorage.getItem(storageKey)).toBe("keys");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Notes panel" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Notes panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(window.localStorage.getItem(storageKey)).toBe("notes");
  });

  it("lays out mobile section tabs in two rows with notes on first row", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByRole("tab", { name: "Keys panel" }).className).toContain("row-start-1");
    expect(screen.getByRole("tab", { name: "Keys panel" }).className).toContain("col-start-1");

    expect(screen.getByRole("tab", { name: "Timeline panel" }).className).toContain("row-start-1");
    expect(screen.getByRole("tab", { name: "Timeline panel" }).className).toContain("col-start-2");

    expect(screen.getByRole("tab", { name: "Files panel" }).className).toContain("row-start-1");
    expect(screen.getByRole("tab", { name: "Files panel" }).className).toContain("col-start-3");

    expect(screen.getByRole("tab", { name: "Notes panel" }).className).toContain("row-start-1");
    expect(screen.getByRole("tab", { name: "Notes panel" }).className).toContain("col-start-4");

    expect(screen.getByRole("tab", { name: "Changes panel" }).className).toContain("row-start-2");
    expect(screen.getByRole("tab", { name: "Changes panel" }).className).toContain("col-start-1");

    expect(screen.getByRole("tab", { name: "Commits panel" }).className).toContain("row-start-2");
    expect(screen.getByRole("tab", { name: "Commits panel" }).className).toContain("col-start-2");

    expect(screen.getByRole("tab", { name: "Worktrees panel" }).className).toContain("row-start-2");
    expect(screen.getByRole("tab", { name: "Worktrees panel" }).className).toContain("col-start-3");
  });

  it("restores last selected tab from localStorage", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const storageKey = buildSectionTabStorageKey({
      repoRoot: session.repoRoot,
      branch: session.branch,
    });
    window.localStorage.setItem(storageKey, "file");
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByText("File Navigator")).toBeTruthy();
    expect(screen.queryByText("State Timeline")).toBeNull();
  });

  it("restores worktrees tab from localStorage", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const storageKey = buildSectionTabStorageKey({
      repoRoot: session.repoRoot,
      branch: session.branch,
    });
    window.localStorage.setItem(storageKey, "worktrees");
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByTestId("worktree-section")).toBeTruthy();
    expect(screen.getByText("Worktree selector is not available for this session.")).toBeTruthy();
    expect(screen.queryByText("State Timeline")).toBeNull();
  });

  it("hides section panels when close tab is selected", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const storageKey = buildSectionTabStorageKey({
      repoRoot: session.repoRoot,
      branch: session.branch,
    });
    window.localStorage.setItem(storageKey, "timeline");
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByText("State Timeline")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Close detail sections" }), {
      button: 0,
    });

    expect(screen.queryByText("State Timeline")).toBeNull();
    expect(screen.queryByText("File Navigator")).toBeNull();
    expect(screen.queryByText("Commit Log")).toBeNull();
    expect(screen.queryByText("No notes yet")).toBeNull();
    expect(window.localStorage.getItem(storageKey)).toBe(CLOSE_DETAIL_TAB_VALUE);
  });

  it("restores close tab state from localStorage", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const storageKey = buildSectionTabStorageKey({
      repoRoot: session.repoRoot,
      branch: session.branch,
    });
    window.localStorage.setItem(storageKey, CLOSE_DETAIL_TAB_VALUE);
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.queryByText("State Timeline")).toBeNull();
    expect(screen.queryByText("File Navigator")).toBeNull();
    expect(screen.queryByText("Commit Log")).toBeNull();
    expect(screen.queryByText("No notes yet")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "Close detail sections" }).getAttribute("data-state"),
    ).toBe("active");
  });

  it("ignores close tab state on non-mobile layouts", () => {
    const session = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const storageKey = buildSectionTabStorageKey({
      repoRoot: session.repoRoot,
      branch: session.branch,
    });
    window.localStorage.setItem(storageKey, CLOSE_DETAIL_TAB_VALUE);
    const props = createViewProps({
      meta: { session },
      timeline: { isMobile: false },
    });
    renderWithRouter(<SessionDetailView {...props} />);

    expect(screen.getByText("State Timeline")).toBeTruthy();
    expect(screen.getByText("File Navigator")).toBeTruthy();
    expect(screen.getByText("Commit Log")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Close detail sections" })).toBeNull();
  });

  it("stores mobile tab selection independently per repo branch", () => {
    const mainSession = createSessionDetail({ repoRoot: "/Users/test/repo-a", branch: "main" });
    const featureSession = createSessionDetail({
      repoRoot: "/Users/test/repo-a",
      branch: "feature/mobile-tabs",
    });
    const mainStorageKey = buildSectionTabStorageKey({
      repoRoot: mainSession.repoRoot,
      branch: mainSession.branch,
    });
    const featureStorageKey = buildSectionTabStorageKey({
      repoRoot: featureSession.repoRoot,
      branch: featureSession.branch,
    });

    const mainProps = createViewProps({
      meta: { session: mainSession },
      timeline: { isMobile: true },
    });
    const firstRender = renderWithRouter(<SessionDetailView {...mainProps} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Changes panel" }), { button: 0 });
    expect(window.localStorage.getItem(mainStorageKey)).toBe("changes");
    firstRender.unmount();

    const featureProps = createViewProps({
      meta: { session: featureSession },
      timeline: { isMobile: true },
    });
    renderWithRouter(<SessionDetailView {...featureProps} />);

    expect(screen.getByRole("tab", { name: "Timeline panel" }).getAttribute("data-state")).toBe(
      "active",
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Files panel" }), { button: 0 });
    expect(window.localStorage.getItem(featureStorageKey)).toBe("file");
    expect(window.localStorage.getItem(mainStorageKey)).toBe("changes");
  });
});
