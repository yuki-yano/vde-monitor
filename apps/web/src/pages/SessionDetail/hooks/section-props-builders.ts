import type {
  CommitDetail,
  CommitFileDiff,
  CommitLog,
  DiffFile,
  DiffSummary,
  RepoFileContent,
  RepoFileSearchPage,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionSummary,
} from "@vde-monitor/shared";
import type { RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import type { ScreenMode } from "@/lib/screen-loading";
import type { SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";

import type { FileTreeRenderNode } from "./useSessionFiles";

type BuildDiffSectionPropsArgs = {
  diffSummary: DiffSummary | null;
  diffError: string | null;
  diffLoading: boolean;
  diffFiles: Record<string, DiffFile>;
  diffOpen: Record<string, boolean>;
  diffLoadingFiles: Record<string, boolean>;
  refreshDiff: () => void;
  toggleDiff: (path: string) => void;
};

type BuildStateTimelineSectionPropsArgs = {
  stateTimeline: SessionStateTimeline | null;
  timelineRange: SessionStateTimelineRange;
  timelineError: string | null;
  timelineLoading: boolean;
  timelineExpanded: boolean;
  isMobile: boolean;
  setTimelineRange: (range: SessionStateTimelineRange) => void;
  refreshTimeline: () => void;
  toggleTimelineExpanded: () => void;
};

type BuildCommitSectionPropsArgs = {
  commitLog: CommitLog | null;
  commitError: string | null;
  commitLoading: boolean;
  commitLoadingMore: boolean;
  commitHasMore: boolean;
  commitDetails: Record<string, CommitDetail>;
  commitFileDetails: Record<string, CommitFileDiff>;
  commitFileOpen: Record<string, boolean>;
  commitFileLoading: Record<string, boolean>;
  commitOpen: Record<string, boolean>;
  commitLoadingDetails: Record<string, boolean>;
  copiedHash: string | null;
  refreshCommitLog: () => void;
  loadMoreCommits: () => void;
  toggleCommit: (hash: string) => void;
  toggleCommitFile: (hash: string, path: string) => void;
  copyHash: (hash: string) => void;
};

type BuildFileNavigatorSectionPropsArgs = {
  unavailable: boolean;
  selectedFilePath: string | null;
  searchQuery: string;
  searchActiveIndex: number;
  searchResult: RepoFileSearchPage | null;
  searchLoading: boolean;
  searchError: string | null;
  searchMode: "all-matches" | "active-only";
  treeLoading: boolean;
  treeError: string | null;
  treeNodes: FileTreeRenderNode[];
  rootTreeHasMore: boolean;
  searchHasMore: boolean;
  onSearchQueryChange: (value: string) => void;
  onSearchMove: (delta: number) => void;
  onSearchConfirm: () => void;
  onToggleDirectory: (targetPath: string) => void;
  onSelectFile: (targetPath: string) => void;
  onOpenFileModal: (targetPath: string) => void;
  onLoadMoreTreeRoot: () => void;
  onLoadMoreSearch: () => void;
};

type BuildFileContentModalPropsArgs = {
  fileModalOpen: boolean;
  fileModalPath: string | null;
  fileModalLoading: boolean;
  fileModalError: string | null;
  fileModalFile: RepoFileContent | null;
  fileModalMarkdownViewMode: "code" | "preview";
  fileModalShowLineNumbers: boolean;
  fileModalCopiedPath: boolean;
  fileModalCopyError: string | null;
  fileModalHighlightLine: number | null;
  resolvedTheme: Theme;
  onCloseFileModal: () => void;
  onToggleFileModalLineNumbers: () => void;
  onCopyFileModalPath: () => Promise<void>;
  onSetFileModalMarkdownViewMode: (mode: "code" | "preview") => void;
};

type BuildScreenPanelPropsArgs = {
  mode: ScreenMode;
  connectionIssue: string | null;
  fallbackReason: string | null;
  error: string | null;
  pollingPauseReason: "disconnected" | "unauthorized" | "offline" | "hidden" | null;
  contextLeftLabel: string | null;
  isScreenLoading: boolean;
  imageBase64: string | null;
  screenLines: string[];
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  forceFollow: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  fileResolveError: string | null;
  handleModeChange: (mode: ScreenMode) => void;
  handleRefreshScreen: () => void;
  handleAtBottomChange: (value: boolean) => void;
  scrollToBottom: (behavior: "auto" | "smooth") => void;
  handleUserScrollStateChange: (value: boolean) => void;
  onResolveLogFileReference: (args: {
    rawToken: string;
    sourcePaneId: string;
    sourceRepoRoot: string | null;
  }) => Promise<void>;
  onResolveLogFileReferenceCandidates: (args: {
    rawTokens: string[];
    sourcePaneId: string;
    sourceRepoRoot: string | null;
  }) => Promise<string[]>;
  paneId: string;
  sourceRepoRoot: string | null;
};

type BuildQuickPanelPropsArgs = {
  quickPanelOpen: boolean;
  sessionGroups: SessionGroup[];
  nowMs: number;
  paneId: string;
  openLogModal: (paneId: string) => void;
  handleOpenPaneHere: (paneId: string) => void;
  closeQuickPanel: () => void;
  toggleQuickPanel: () => void;
};

type BuildLogModalPropsArgs = {
  logModalOpen: boolean;
  selectedSession: SessionSummary | null;
  selectedLogLines: string[];
  selectedLogLoading: boolean;
  selectedLogError: string | null;
  closeLogModal: () => void;
  handleOpenHere: () => void;
  handleOpenInNewTab: () => void;
};

type LogFileCandidateItem = {
  path: string;
  name: string;
  isIgnored?: boolean;
};

type BuildLogFileCandidateModalPropsArgs = {
  logFileCandidateModalOpen: boolean;
  logFileCandidateReference: string | null;
  logFileCandidateItems: LogFileCandidateItem[];
  onCloseLogFileCandidateModal: () => void;
  onSelectLogFileCandidate: (path: string) => void;
};

export const buildDiffSectionProps = ({
  diffSummary,
  diffError,
  diffLoading,
  diffFiles,
  diffOpen,
  diffLoadingFiles,
  refreshDiff,
  toggleDiff,
}: BuildDiffSectionPropsArgs) => ({
  state: {
    diffSummary,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
  },
  actions: {
    onRefresh: refreshDiff,
    onToggle: toggleDiff,
  },
});

export const buildStateTimelineSectionProps = ({
  stateTimeline,
  timelineRange,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineRange,
  refreshTimeline,
  toggleTimelineExpanded,
}: BuildStateTimelineSectionPropsArgs) => ({
  state: {
    timeline: stateTimeline,
    timelineRange,
    timelineError,
    timelineLoading,
    timelineExpanded,
    isMobile,
  },
  actions: {
    onTimelineRangeChange: setTimelineRange,
    onTimelineRefresh: refreshTimeline,
    onToggleTimelineExpanded: toggleTimelineExpanded,
  },
});

export const buildCommitSectionProps = ({
  commitLog,
  commitError,
  commitLoading,
  commitLoadingMore,
  commitHasMore,
  commitDetails,
  commitFileDetails,
  commitFileOpen,
  commitFileLoading,
  commitOpen,
  commitLoadingDetails,
  copiedHash,
  refreshCommitLog,
  loadMoreCommits,
  toggleCommit,
  toggleCommitFile,
  copyHash,
}: BuildCommitSectionPropsArgs) => ({
  state: {
    commitLog,
    commitError,
    commitLoading,
    commitLoadingMore,
    commitHasMore,
    commitDetails,
    commitFileDetails,
    commitFileOpen,
    commitFileLoading,
    commitOpen,
    commitLoadingDetails,
    copiedHash,
  },
  actions: {
    onRefresh: refreshCommitLog,
    onLoadMore: loadMoreCommits,
    onToggleCommit: toggleCommit,
    onToggleCommitFile: toggleCommitFile,
    onCopyHash: copyHash,
  },
});

export const buildFileNavigatorSectionProps = ({
  unavailable,
  selectedFilePath,
  searchQuery,
  searchActiveIndex,
  searchResult,
  searchLoading,
  searchError,
  searchMode,
  treeLoading,
  treeError,
  treeNodes,
  rootTreeHasMore,
  searchHasMore,
  onSearchQueryChange,
  onSearchMove,
  onSearchConfirm,
  onToggleDirectory,
  onSelectFile,
  onOpenFileModal,
  onLoadMoreTreeRoot,
  onLoadMoreSearch,
}: BuildFileNavigatorSectionPropsArgs) => ({
  state: {
    unavailable,
    selectedFilePath,
    searchQuery,
    searchActiveIndex,
    searchResult,
    searchLoading,
    searchError,
    searchMode,
    treeLoading,
    treeError,
    treeNodes,
    rootTreeHasMore,
    searchHasMore,
  },
  actions: {
    onSearchQueryChange,
    onSearchMove,
    onSearchConfirm,
    onToggleDirectory,
    onSelectFile,
    onOpenFileModal,
    onLoadMoreTreeRoot,
    onLoadMoreSearch,
  },
});

export const buildFileContentModalProps = ({
  fileModalOpen,
  fileModalPath,
  fileModalLoading,
  fileModalError,
  fileModalFile,
  fileModalMarkdownViewMode,
  fileModalShowLineNumbers,
  fileModalCopiedPath,
  fileModalCopyError,
  fileModalHighlightLine,
  resolvedTheme,
  onCloseFileModal,
  onToggleFileModalLineNumbers,
  onCopyFileModalPath,
  onSetFileModalMarkdownViewMode,
}: BuildFileContentModalPropsArgs) => ({
  state: {
    open: fileModalOpen,
    path: fileModalPath,
    loading: fileModalLoading,
    error: fileModalError,
    file: fileModalFile,
    markdownViewMode: fileModalMarkdownViewMode,
    showLineNumbers: fileModalShowLineNumbers,
    copiedPath: fileModalCopiedPath,
    copyError: fileModalCopyError,
    highlightLine: fileModalHighlightLine,
    theme: resolvedTheme,
  },
  actions: {
    onClose: onCloseFileModal,
    onToggleLineNumbers: onToggleFileModalLineNumbers,
    onCopyPath: onCopyFileModalPath,
    onMarkdownViewModeChange: onSetFileModalMarkdownViewMode,
  },
});

export const buildScreenPanelProps = ({
  mode,
  connectionIssue,
  fallbackReason,
  error,
  pollingPauseReason,
  contextLeftLabel,
  isScreenLoading,
  imageBase64,
  screenLines,
  virtuosoRef,
  scrollerRef,
  isAtBottom,
  forceFollow,
  rawMode,
  allowDangerKeys,
  fileResolveError,
  handleModeChange,
  handleRefreshScreen,
  handleAtBottomChange,
  scrollToBottom,
  handleUserScrollStateChange,
  onResolveLogFileReference,
  onResolveLogFileReferenceCandidates,
  paneId,
  sourceRepoRoot,
}: BuildScreenPanelPropsArgs) => ({
  state: {
    mode,
    connectionIssue,
    fallbackReason,
    error,
    pollingPauseReason,
    contextLeftLabel,
    isScreenLoading,
    imageBase64,
    screenLines,
    virtuosoRef,
    scrollerRef,
    isAtBottom,
    forceFollow,
    rawMode,
    allowDangerKeys,
    fileResolveError,
  },
  actions: {
    onModeChange: handleModeChange,
    onRefresh: handleRefreshScreen,
    onAtBottomChange: handleAtBottomChange,
    onScrollToBottom: scrollToBottom,
    onUserScrollStateChange: handleUserScrollStateChange,
    onResolveFileReference: (rawToken: string) =>
      onResolveLogFileReference({
        rawToken,
        sourcePaneId: paneId,
        sourceRepoRoot,
      }),
    onResolveFileReferenceCandidates: (rawTokens: string[]) =>
      onResolveLogFileReferenceCandidates({
        rawTokens,
        sourcePaneId: paneId,
        sourceRepoRoot,
      }),
  },
});

export const buildQuickPanelProps = ({
  quickPanelOpen,
  sessionGroups,
  nowMs,
  paneId,
  openLogModal,
  handleOpenPaneHere,
  closeQuickPanel,
  toggleQuickPanel,
}: BuildQuickPanelPropsArgs) => ({
  state: {
    open: quickPanelOpen,
    sessionGroups,
    allSessions: sessionGroups.flatMap((group) => group.sessions),
    nowMs,
    currentPaneId: paneId,
  },
  actions: {
    onOpenLogModal: openLogModal,
    onOpenSessionLink: handleOpenPaneHere,
    onClose: closeQuickPanel,
    onToggle: toggleQuickPanel,
  },
});

export const buildLogModalProps = ({
  logModalOpen,
  selectedSession,
  selectedLogLines,
  selectedLogLoading,
  selectedLogError,
  closeLogModal,
  handleOpenHere,
  handleOpenInNewTab,
}: BuildLogModalPropsArgs) => ({
  state: {
    open: logModalOpen,
    session: selectedSession,
    logLines: selectedLogLines,
    loading: selectedLogLoading,
    error: selectedLogError,
  },
  actions: {
    onClose: closeLogModal,
    onOpenHere: handleOpenHere,
    onOpenNewTab: handleOpenInNewTab,
  },
});

export const buildLogFileCandidateModalProps = ({
  logFileCandidateModalOpen,
  logFileCandidateReference,
  logFileCandidateItems,
  onCloseLogFileCandidateModal,
  onSelectLogFileCandidate,
}: BuildLogFileCandidateModalPropsArgs) => ({
  state: {
    open: logFileCandidateModalOpen,
    reference: logFileCandidateReference,
    items: logFileCandidateItems,
  },
  actions: {
    onClose: onCloseLogFileCandidateModal,
    onSelect: onSelectLogFileCandidate,
  },
});
