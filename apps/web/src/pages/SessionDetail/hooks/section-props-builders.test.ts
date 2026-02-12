import { describe, expect, it, vi } from "vitest";

import {
  buildCommitSectionProps,
  buildDiffSectionProps,
  buildFileContentModalProps,
  buildFileNavigatorSectionProps,
  buildLogFileCandidateModalProps,
  buildLogModalProps,
  buildQuickPanelProps,
  buildScreenPanelProps,
  buildStateTimelineSectionProps,
} from "./section-props-builders";

describe("section props builders", () => {
  it("builds diff section props with state and action passthrough", () => {
    const refreshDiff = vi.fn();
    const toggleDiff = vi.fn();
    const diffFiles = {
      "a.ts": {
        path: "a.ts",
        status: "M" as const,
        patch: "@@ -1,1 +1,1 @@",
        binary: false,
        rev: "HEAD",
      },
    };

    const props = buildDiffSectionProps({
      diffSummary: {
        repoRoot: "/repo",
        rev: "HEAD",
        generatedAt: new Date(0).toISOString(),
        files: [],
      },
      diffError: null,
      diffLoading: false,
      diffFiles,
      diffOpen: { "a.ts": true },
      diffLoadingFiles: {},
      refreshDiff,
      toggleDiff,
    });

    expect(props.state.diffFiles).toBe(diffFiles);
    expect(props.actions.onRefresh).toBe(refreshDiff);
    expect(props.actions.onToggle).toBe(toggleDiff);
  });

  it("builds timeline section props with renamed action keys", () => {
    const setTimelineRange = vi.fn();
    const refreshTimeline = vi.fn();
    const toggleTimelineExpanded = vi.fn();

    const props = buildStateTimelineSectionProps({
      stateTimeline: {
        paneId: "%1",
        now: new Date(0).toISOString(),
        range: "1h",
        items: [],
        totalsMs: {
          RUNNING: 0,
          WAITING_INPUT: 0,
          WAITING_PERMISSION: 0,
          SHELL: 0,
          UNKNOWN: 0,
        },
        current: null,
      },
      timelineRange: "1h",
      timelineError: null,
      timelineLoading: true,
      timelineExpanded: false,
      isMobile: true,
      setTimelineRange,
      refreshTimeline,
      toggleTimelineExpanded,
    });

    expect(props.state.timelineRange).toBe("1h");
    expect(props.actions.onTimelineRangeChange).toBe(setTimelineRange);
    expect(props.actions.onTimelineRefresh).toBe(refreshTimeline);
    expect(props.actions.onToggleTimelineExpanded).toBe(toggleTimelineExpanded);
  });

  it("builds commit section props with full action mapping", () => {
    const refreshCommitLog = vi.fn();
    const loadMoreCommits = vi.fn();
    const toggleCommit = vi.fn();
    const toggleCommitFile = vi.fn();
    const copyHash = vi.fn();

    const props = buildCommitSectionProps({
      commitLog: {
        repoRoot: "/repo",
        rev: "HEAD",
        generatedAt: new Date(0).toISOString(),
        commits: [],
      },
      commitError: null,
      commitLoading: false,
      commitLoadingMore: false,
      commitHasMore: true,
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

    expect(props.state.commitHasMore).toBe(true);
    expect(props.actions.onRefresh).toBe(refreshCommitLog);
    expect(props.actions.onLoadMore).toBe(loadMoreCommits);
    expect(props.actions.onToggleCommit).toBe(toggleCommit);
    expect(props.actions.onToggleCommitFile).toBe(toggleCommitFile);
    expect(props.actions.onCopyHash).toBe(copyHash);
  });

  it("builds file navigator section props with passthrough actions", () => {
    const onSearchQueryChange = vi.fn();
    const onSearchMove = vi.fn();
    const onSearchConfirm = vi.fn();
    const onToggleDirectory = vi.fn();
    const onSelectFile = vi.fn();
    const onOpenFileModal = vi.fn();
    const onLoadMoreTreeRoot = vi.fn();
    const onLoadMoreSearch = vi.fn();

    const props = buildFileNavigatorSectionProps({
      unavailable: false,
      selectedFilePath: "src/main.ts",
      searchQuery: "main",
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
      onSearchQueryChange,
      onSearchMove,
      onSearchConfirm,
      onToggleDirectory,
      onSelectFile,
      onOpenFileModal,
      onLoadMoreTreeRoot,
      onLoadMoreSearch,
    });

    expect(props.state.selectedFilePath).toBe("src/main.ts");
    expect(props.actions.onSearchQueryChange).toBe(onSearchQueryChange);
    expect(props.actions.onLoadMoreSearch).toBe(onLoadMoreSearch);
  });

  it("builds file content modal props with theme and callbacks", async () => {
    const onCloseFileModal = vi.fn();
    const onToggleFileModalLineNumbers = vi.fn();
    const onCopyFileModalPath = vi.fn(async () => undefined);
    const onSetFileModalMarkdownViewMode = vi.fn();

    const props = buildFileContentModalProps({
      fileModalOpen: true,
      fileModalPath: "README.md",
      fileModalLoading: false,
      fileModalError: null,
      fileModalFile: {
        path: "README.md",
        sizeBytes: 12,
        isBinary: false,
        truncated: false,
        languageHint: "markdown",
        content: "# hello",
      },
      fileModalMarkdownViewMode: "preview",
      fileModalShowLineNumbers: true,
      fileModalCopiedPath: false,
      fileModalCopyError: null,
      fileModalHighlightLine: 2,
      resolvedTheme: "latte",
      onCloseFileModal,
      onToggleFileModalLineNumbers,
      onCopyFileModalPath,
      onSetFileModalMarkdownViewMode,
    });

    expect(props.state.theme).toBe("latte");
    expect(props.actions.onClose).toBe(onCloseFileModal);
    await props.actions.onCopyPath();
    expect(onCopyFileModalPath).toHaveBeenCalledTimes(1);
  });

  it("builds screen panel props and injects pane context to resolve actions", async () => {
    const handleModeChange = vi.fn();
    const handleRefreshScreen = vi.fn();
    const handleAtBottomChange = vi.fn();
    const scrollToBottom = vi.fn();
    const handleUserScrollStateChange = vi.fn();
    const onResolveLogFileReference = vi.fn(async () => undefined);
    const onResolveLogFileReferenceCandidates = vi.fn(async () => ["index.ts"]);

    const props = buildScreenPanelProps({
      mode: "text",
      connectionIssue: null,
      fallbackReason: null,
      error: null,
      pollingPauseReason: null,
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
      handleModeChange,
      handleRefreshScreen,
      handleAtBottomChange,
      scrollToBottom,
      handleUserScrollStateChange,
      onResolveLogFileReference,
      onResolveLogFileReferenceCandidates,
      paneId: "%1",
      sourceRepoRoot: "/repo",
    });

    await props.actions.onResolveFileReference("src/index.ts:12");
    expect(onResolveLogFileReference).toHaveBeenCalledWith({
      rawToken: "src/index.ts:12",
      sourcePaneId: "%1",
      sourceRepoRoot: "/repo",
    });

    await props.actions.onResolveFileReferenceCandidates(["src/index.ts"]);
    expect(onResolveLogFileReferenceCandidates).toHaveBeenCalledWith({
      rawTokens: ["src/index.ts"],
      sourcePaneId: "%1",
      sourceRepoRoot: "/repo",
    });
  });

  it("builds quick/log/log-candidate props with flattened sessions", () => {
    const openLogModal = vi.fn();
    const handleOpenPaneHere = vi.fn();
    const closeQuickPanel = vi.fn();
    const toggleQuickPanel = vi.fn();
    const closeLogModal = vi.fn();
    const handleOpenHere = vi.fn();
    const handleOpenInNewTab = vi.fn();
    const onCloseLogFileCandidateModal = vi.fn();
    const onSelectLogFileCandidate = vi.fn();

    const session = {
      paneId: "%1",
      sessionName: "s",
      windowIndex: 0,
      paneIndex: 0,
      windowActivity: null,
      paneActive: true,
      currentCommand: null,
      currentPath: null,
      paneTty: null,
      title: null,
      customTitle: null,
      repoRoot: "/repo",
      agent: "codex" as const,
      state: "RUNNING" as const,
      stateReason: "running",
      lastMessage: null,
      lastOutputAt: null,
      lastEventAt: null,
      lastInputAt: null,
      paneDead: false,
      alternateOn: false,
      pipeAttached: false,
      pipeConflict: false,
    };

    const quickPanelProps = buildQuickPanelProps({
      quickPanelOpen: true,
      sessionGroups: [{ repoRoot: "/repo", sessions: [session], lastInputAt: null }],
      nowMs: 1,
      paneId: "%1",
      openLogModal,
      handleOpenPaneHere,
      closeQuickPanel,
      toggleQuickPanel,
    });
    expect(quickPanelProps.state.allSessions).toEqual([session]);
    expect(quickPanelProps.actions.onOpenLogModal).toBe(openLogModal);

    const logModalProps = buildLogModalProps({
      logModalOpen: true,
      selectedSession: session,
      selectedLogLines: ["line"],
      selectedLogLoading: false,
      selectedLogError: null,
      closeLogModal,
      handleOpenHere,
      handleOpenInNewTab,
    });
    expect(logModalProps.state.session).toBe(session);
    expect(logModalProps.actions.onOpenHere).toBe(handleOpenHere);

    const logFileCandidateModalProps = buildLogFileCandidateModalProps({
      logFileCandidateModalOpen: true,
      logFileCandidateReference: "index.ts",
      logFileCandidateItems: [{ path: "src/index.ts", name: "index.ts" }],
      onCloseLogFileCandidateModal,
      onSelectLogFileCandidate,
    });
    expect(logFileCandidateModalProps.state.reference).toBe("index.ts");
    expect(logFileCandidateModalProps.actions.onSelect).toBe(onSelectLogFileCandidate);
  });
});
