import type {
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
} from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import {
  buildActionsSection,
  buildCommitsSection,
  buildControlsSection,
  buildFilesSection,
  buildLayoutSection,
  buildLogsSection,
  buildMetaSection,
  buildScreenSection,
  buildSidebarSection,
  buildTimelineSection,
  buildTitleSection,
} from "./session-detail-vm-section-builders";

describe("session detail vm section builders", () => {
  it("builds timeline/logs/title/actions sections", () => {
    const handleSidebarPointerDown = vi.fn();
    const handleDetailSplitPointerDown = vi.fn();
    const setTimelineRange = vi.fn();
    const toggleTimelineExpanded = vi.fn();
    const refreshTimeline = vi.fn();
    const openLogModal = vi.fn();
    const closeLogModal = vi.fn();
    const toggleQuickPanel = vi.fn();
    const closeQuickPanel = vi.fn();
    const openTitleEditor = vi.fn();
    const closeTitleEditor = vi.fn();
    const updateTitleDraft = vi.fn();
    const saveTitle = vi.fn();
    const resetTitle = vi.fn();
    const handleFocusPane = vi.fn(async () => undefined);
    const handleLaunchAgentInSession = vi.fn(async () => undefined);
    const handleTouchPaneWithRepoAnchor = vi.fn();
    const handleTouchRepoPin = vi.fn();
    const handleOpenPaneHere = vi.fn();
    const handleOpenPaneInNewWindow = vi.fn();
    const handleOpenHere = vi.fn();
    const handleOpenInNewTab = vi.fn();
    const handleAtBottomChange = vi.fn();
    const handleUserScrollStateChange = vi.fn();
    const scrollToBottom = vi.fn();
    const handleModeChange = vi.fn();
    const handleRefreshScreen = vi.fn();
    const handleSendKey = vi.fn(async () => undefined);
    const handleSendText = vi.fn(async () => undefined);
    const handleUploadImage = vi.fn(async () => undefined);
    const handleRawBeforeInput = vi.fn();
    const handleRawInput = vi.fn();
    const handleRawKeyDown = vi.fn();
    const handleRawCompositionStart = vi.fn();
    const handleRawCompositionEnd = vi.fn();
    const toggleAutoEnter = vi.fn();
    const toggleShift = vi.fn();
    const toggleCtrl = vi.fn();
    const toggleRawMode = vi.fn();
    const toggleAllowDangerKeys = vi.fn();
    const handleKillPane = vi.fn(async () => undefined);
    const handleKillWindow = vi.fn(async () => undefined);
    const handleTouchCurrentSession = vi.fn();
    const onSearchQueryChange = vi.fn();
    const onSearchMove = vi.fn();
    const onSearchConfirm = vi.fn();
    const onToggleDirectory = vi.fn();
    const onSelectFile = vi.fn();
    const onOpenFileModal = vi.fn();
    const onCloseFileModal = vi.fn();
    const onSetFileModalMarkdownViewMode = vi.fn();
    const onToggleFileModalLineNumbers = vi.fn();
    const onCopyFileModalPath = vi.fn(async () => undefined);
    const onResolveLogFileReference = vi.fn(async () => undefined);
    const onResolveLogFileReferenceCandidates = vi.fn(async () => []);
    const onSelectLogFileCandidate = vi.fn();
    const onCloseLogFileCandidateModal = vi.fn();
    const onLoadMoreTreeRoot = vi.fn();
    const onLoadMoreSearch = vi.fn();
    const refreshCommitLog = vi.fn();
    const loadMoreCommits = vi.fn();
    const toggleCommit = vi.fn();
    const toggleCommitFile = vi.fn();
    const copyHash = vi.fn();
    const getRepoSortAnchorAt = vi.fn(() => null);
    const requestStateTimeline = vi.fn() as unknown as (
      paneId: string,
      options?: {
        scope?: SessionStateTimelineScope;
        range?: SessionStateTimelineRange;
        limit?: number;
      },
    ) => Promise<SessionStateTimeline>;
    const requestScreen = vi.fn() as unknown as (
      paneId: string,
      options: { lines?: number; mode?: "text" | "image"; cursor?: string },
    ) => Promise<ScreenResponse>;
    const requestWorktrees = vi.fn(async () => ({
      repoRoot: null,
      currentPath: null,
      entries: [],
    }));
    const launchConfig = {
      agents: {
        codex: { options: ["--model", "gpt-5"] },
        claude: { options: [] },
      },
    };

    const meta = buildMetaSection({
      paneId: "pane-1",
      session: null,
      nowMs: 123,
      connected: true,
      connectionIssue: null,
    });
    expect(meta.paneId).toBe("pane-1");
    expect(meta.nowMs).toBe(123);

    const sidebar = buildSidebarSection({
      sessionGroups: [],
      getRepoSortAnchorAt,
      connected: true,
      connectionIssue: null,
      launchConfig,
      requestWorktrees,
      requestStateTimeline,
      requestScreen,
      highlightCorrections: { codex: true, claude: false },
      resolvedTheme: "latte",
    });
    expect(sidebar.getRepoSortAnchorAt).toBe(getRepoSortAnchorAt);
    expect(sidebar.resolvedTheme).toBe("latte");
    expect(sidebar.launchConfig).toEqual(launchConfig);
    expect(sidebar.requestWorktrees).toBe(requestWorktrees);

    const layout = buildLayoutSection({
      is2xlUp: true,
      sidebarWidth: 280,
      handleSidebarPointerDown,
      detailSplitRatio: 0.5,
      detailSplitRef: { current: null },
      handleDetailSplitPointerDown,
    });
    expect(layout.sidebarWidth).toBe(280);
    expect(layout.handleDetailSplitPointerDown).toBe(handleDetailSplitPointerDown);

    const timeline = buildTimelineSection({
      timeline: null,
      timelineScope: "pane",
      timelineRange: "1h",
      hasRepoTimeline: true,
      timelineError: null,
      timelineLoading: false,
      timelineExpanded: true,
      isMobile: false,
      setTimelineScope: vi.fn(),
      setTimelineRange,
      toggleTimelineExpanded,
      refreshTimeline,
    });
    expect(timeline.timelineScope).toBe("pane");
    expect(timeline.timelineRange).toBe("1h");
    expect(timeline.setTimelineRange).toBe(setTimelineRange);

    const screen = buildScreenSection({
      mode: "text",
      screenLines: ["line"],
      imageBase64: null,
      fallbackReason: null,
      error: null,
      pollingPauseReason: null,
      contextLeftLabel: "74% context left",
      isScreenLoading: false,
      isAtBottom: true,
      handleAtBottomChange,
      handleUserScrollStateChange,
      forceFollow: false,
      scrollToBottom,
      handleModeChange,
      virtuosoRef: { current: null },
      scrollerRef: { current: null },
      handleRefreshScreen,
    });
    expect(screen.contextLeftLabel).toBe("74% context left");
    expect(screen.handleRefreshScreen).toBe(handleRefreshScreen);

    const controls = buildControlsSection({
      interactive: true,
      textInputRef: { current: null },
      autoEnter: true,
      shiftHeld: false,
      ctrlHeld: false,
      rawMode: false,
      allowDangerKeys: false,
      isSendingText: false,
      handleSendKey,
      handleKillPane,
      handleKillWindow,
      handleSendText,
      handleUploadImage,
      handleRawBeforeInput,
      handleRawInput,
      handleRawKeyDown,
      handleRawCompositionStart,
      handleRawCompositionEnd,
      toggleAutoEnter,
      toggleShift,
      toggleCtrl,
      toggleRawMode,
      toggleAllowDangerKeys,
      handleTouchCurrentSession,
    });
    expect(controls.handleTouchSession).toBe(handleTouchCurrentSession);
    expect(controls.handleSendText).toBe(handleSendText);

    const files = buildFilesSection({
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
      onSearchQueryChange,
      onSearchMove,
      onSearchConfirm,
      onToggleDirectory,
      onSelectFile,
      onOpenFileModal,
      onCloseFileModal,
      onSetFileModalMarkdownViewMode,
      onToggleFileModalLineNumbers,
      onCopyFileModalPath,
      onResolveLogFileReference,
      onResolveLogFileReferenceCandidates,
      onSelectLogFileCandidate,
      onCloseLogFileCandidateModal,
      onLoadMoreTreeRoot,
      onLoadMoreSearch,
    });
    expect(files.onLoadMoreSearch).toBe(onLoadMoreSearch);
    expect(files.fileModalMarkdownViewMode).toBe("code");

    const commits = buildCommitsSection({
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
      refreshCommitLog,
      loadMoreCommits,
      toggleCommit,
      toggleCommitFile,
      copyHash,
    });
    expect(commits.copyHash).toBe(copyHash);
    expect(commits.refreshCommitLog).toBe(refreshCommitLog);

    const logs = buildLogsSection({
      quickPanelOpen: false,
      logModalOpen: true,
      selectedSession: null,
      selectedLogLines: ["line"],
      selectedLogLoading: false,
      selectedLogError: null,
      openLogModal,
      closeLogModal,
      toggleQuickPanel,
      closeQuickPanel,
    });
    expect(logs.selectedLogLines).toEqual(["line"]);
    expect(logs.openLogModal).toBe(openLogModal);

    const title = buildTitleSection({
      titleDraft: "draft",
      titleEditing: false,
      titleSaving: false,
      titleError: null,
      openTitleEditor,
      closeTitleEditor,
      updateTitleDraft,
      saveTitle,
      resetTitle,
    });
    expect(title.titleDraft).toBe("draft");
    expect(title.saveTitle).toBe(saveTitle);

    const actions = buildActionsSection({
      handleFocusPane,
      handleLaunchAgentInSession,
      handleTouchPaneWithRepoAnchor,
      handleTouchRepoPin,
      handleOpenPaneHere,
      handleOpenPaneInNewWindow,
      handleOpenHere,
      handleOpenInNewTab,
    });
    expect(actions.handleTouchPane).toBe(handleTouchPaneWithRepoAnchor);
    expect(actions.handleLaunchAgentInSession).toBe(handleLaunchAgentInSession);
    expect(actions.handleOpenPaneInNewWindow).toBe(handleOpenPaneInNewWindow);
    expect(actions.handleOpenInNewTab).toBe(handleOpenInNewTab);
  });
});
