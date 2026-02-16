import type {
  CommitDetail,
  CommitFileDiff,
  CommitLog,
  DiffFile,
  DiffSummary,
  HighlightCorrectionConfig,
  LaunchConfig,
  RepoFileContent,
  RepoFileSearchPage,
  RepoNote,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  SessionSummary,
  WorktreeList,
  WorktreeListEntry,
} from "@vde-monitor/shared";
import type { CompositionEvent, FormEvent, KeyboardEvent, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import type { ScreenMode } from "@/lib/screen-loading";
import type { SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import type { FileTreeRenderNode } from "./useSessionFiles";

type BuildDiffSectionPropsArgs = {
  diffSummary: DiffSummary | null;
  diffBranch?: string | null;
  diffError: string | null;
  diffLoading: boolean;
  diffFiles: Record<string, DiffFile>;
  diffOpen: Record<string, boolean>;
  diffLoadingFiles: Record<string, boolean>;
  refreshDiff: () => void;
  toggleDiff: (path: string) => void;
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type BuildStateTimelineSectionPropsArgs = {
  stateTimeline: SessionStateTimeline | null;
  timelineScope: SessionStateTimelineScope;
  timelineRange: SessionStateTimelineRange;
  hasRepoTimeline: boolean;
  timelineError: string | null;
  timelineLoading: boolean;
  timelineExpanded: boolean;
  isMobile: boolean;
  setTimelineScope: (scope: SessionStateTimelineScope) => void;
  setTimelineRange: (range: SessionStateTimelineRange) => void;
  refreshTimeline: () => void;
  toggleTimelineExpanded: () => void;
};

type BuildCommitSectionPropsArgs = {
  commitLog: CommitLog | null;
  commitBranch?: string | null;
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
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type BuildNotesSectionPropsArgs = {
  repoRoot: string | null;
  notes: RepoNote[];
  notesLoading: boolean;
  notesError: string | null;
  creatingNote: boolean;
  savingNoteId: string | null;
  deletingNoteId: string | null;
  refreshNotes: (options?: { silent?: boolean }) => void;
  createNote: (input: { title?: string | null; body: string }) => Promise<boolean>;
  saveNote: (noteId: string, input: { title?: string | null; body: string }) => Promise<boolean>;
  removeNote: (noteId: string) => Promise<boolean>;
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
  fileModalMarkdownViewMode: "code" | "preview" | "diff";
  fileModalDiffAvailable: boolean;
  fileModalDiffLoading: boolean;
  fileModalDiffPatch: string | null;
  fileModalDiffBinary: boolean;
  fileModalDiffError: string | null;
  fileModalShowLineNumbers: boolean;
  fileModalCopiedPath: boolean;
  fileModalCopyError: string | null;
  fileModalHighlightLine: number | null;
  resolvedTheme: Theme;
  onCloseFileModal: () => void;
  onToggleFileModalLineNumbers: () => void;
  onCopyFileModalPath: () => Promise<void>;
  onSetFileModalMarkdownViewMode: (mode: "code" | "preview" | "diff") => void;
  onLoadFileModalDiff: (path: string) => void;
};

type BuildScreenPanelPropsArgs = {
  mode: ScreenMode;
  connectionIssue: string | null;
  fallbackReason: string | null;
  error: string | null;
  pollingPauseReason: "disconnected" | "unauthorized" | "offline" | "hidden" | null;
  promptGitContext: {
    branch: string | null;
    fileChanges: {
      add: number;
      m: number;
      d: number;
    } | null;
    additions: number | null;
    deletions: number | null;
  } | null;
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
  worktreeSelectorEnabled?: boolean;
  worktreeSelectorLoading?: boolean;
  worktreeSelectorError?: string | null;
  worktreeEntries?: WorktreeListEntry[];
  worktreeRepoRoot?: string | null;
  worktreeBaseBranch?: string | null;
  actualWorktreePath?: string | null;
  virtualWorktreePath?: string | null;
  handleModeChange: (mode: ScreenMode) => void;
  handleRefreshScreen: () => void;
  handleRefreshWorktrees?: () => void | Promise<void>;
  handleAtBottomChange: (value: boolean) => void;
  scrollToBottom: (behavior: "auto" | "smooth") => void;
  handleUserScrollStateChange: (value: boolean) => void;
  onSelectVirtualWorktree?: (path: string) => void;
  onClearVirtualWorktree?: () => void;
  onResolveFileReference: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates: (rawTokens: string[]) => Promise<string[]>;
};

type BuildQuickPanelPropsArgs = {
  quickPanelOpen: boolean;
  sessionGroups: SessionGroup[];
  nowMs: number;
  paneId: string;
  openLogModal: (paneId: string) => void;
  handleOpenPaneHere: (paneId: string) => void;
  handleOpenPaneInNewWindow: (paneId: string) => void;
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

type BuildSessionHeaderPropsArgs = {
  session: SessionSummary | null;
  connectionIssue: string | null;
  nowMs: number;
  titleDraft: string;
  titleEditing: boolean;
  titleSaving: boolean;
  titleError: string | null;
  updateTitleDraft: (value: string) => void;
  saveTitle: () => void;
  resetTitle: () => void;
  openTitleEditor: () => void;
  closeTitleEditor: () => void;
  handleTouchSession: () => void;
};

type BuildSessionSidebarPropsArgs = {
  sessionGroups: SessionGroup[];
  getRepoSortAnchorAt: (repoRoot: string | null) => number | null;
  nowMs: number;
  connected: boolean;
  sidebarConnectionIssue: string | null;
  launchConfig: LaunchConfig;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  requestStateTimeline: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  highlightCorrections: HighlightCorrectionConfig;
  resolvedTheme: Theme;
  paneId: string;
  handleFocusPane: (paneId: string) => Promise<void> | void;
  handleLaunchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void>;
  handleTouchPane: (paneId: string) => void;
  handleTouchRepoPin: (repoRoot: string | null) => void;
};

type BuildControlsPanelPropsArgs = {
  interactive: boolean;
  textInputRef: { current: HTMLTextAreaElement | null };
  autoEnter: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  isSendingText: boolean;
  shiftHeld: boolean;
  ctrlHeld: boolean;
  handleSendText: () => Promise<void>;
  handleUploadImage: (file: File) => Promise<void>;
  toggleAutoEnter: () => void;
  toggleRawMode: () => void;
  toggleAllowDangerKeys: () => void;
  toggleShift: () => void;
  toggleCtrl: () => void;
  handleSendKey: (key: string) => Promise<void>;
  handleKillPane: () => Promise<void>;
  handleKillWindow: () => Promise<void>;
  handleRawBeforeInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  handleRawInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  handleRawKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleRawCompositionStart: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  handleRawCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => void;
};

export const buildDiffSectionProps = ({
  diffSummary,
  diffBranch = null,
  diffError,
  diffLoading,
  diffFiles,
  diffOpen,
  diffLoadingFiles,
  refreshDiff,
  toggleDiff,
  onResolveFileReference,
  onResolveFileReferenceCandidates,
}: BuildDiffSectionPropsArgs) => ({
  state: {
    diffSummary,
    diffBranch,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
  },
  actions: {
    onRefresh: refreshDiff,
    onToggle: toggleDiff,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  },
});

export const buildStateTimelineSectionProps = ({
  stateTimeline,
  timelineScope,
  timelineRange,
  hasRepoTimeline,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineScope,
  setTimelineRange,
  refreshTimeline,
  toggleTimelineExpanded,
}: BuildStateTimelineSectionPropsArgs) => ({
  state: {
    timeline: stateTimeline,
    timelineScope,
    timelineRange,
    hasRepoTimeline,
    timelineError,
    timelineLoading,
    timelineExpanded,
    isMobile,
  },
  actions: {
    onTimelineScopeChange: setTimelineScope,
    onTimelineRangeChange: setTimelineRange,
    onTimelineRefresh: refreshTimeline,
    onToggleTimelineExpanded: toggleTimelineExpanded,
  },
});

export const buildCommitSectionProps = ({
  commitLog,
  commitBranch = null,
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
  onResolveFileReference,
  onResolveFileReferenceCandidates,
}: BuildCommitSectionPropsArgs) => ({
  state: {
    commitLog,
    commitBranch,
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
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  },
});

export const buildNotesSectionProps = ({
  repoRoot,
  notes,
  notesLoading,
  notesError,
  creatingNote,
  savingNoteId,
  deletingNoteId,
  refreshNotes,
  createNote,
  saveNote,
  removeNote,
}: BuildNotesSectionPropsArgs) => ({
  state: {
    repoRoot,
    notes,
    notesLoading,
    notesError,
    creatingNote,
    savingNoteId,
    deletingNoteId,
  },
  actions: {
    onRefresh: refreshNotes,
    onCreate: createNote,
    onSave: saveNote,
    onDelete: removeNote,
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
  fileModalDiffAvailable,
  fileModalDiffLoading,
  fileModalDiffPatch,
  fileModalDiffBinary,
  fileModalDiffError,
  fileModalShowLineNumbers,
  fileModalCopiedPath,
  fileModalCopyError,
  fileModalHighlightLine,
  resolvedTheme,
  onCloseFileModal,
  onToggleFileModalLineNumbers,
  onCopyFileModalPath,
  onSetFileModalMarkdownViewMode,
  onLoadFileModalDiff,
}: BuildFileContentModalPropsArgs) => ({
  state: {
    open: fileModalOpen,
    path: fileModalPath,
    loading: fileModalLoading,
    error: fileModalError,
    file: fileModalFile,
    markdownViewMode: fileModalMarkdownViewMode,
    diffAvailable: fileModalDiffAvailable,
    diffLoading: fileModalDiffLoading,
    diffPatch: fileModalDiffPatch,
    diffBinary: fileModalDiffBinary,
    diffError: fileModalDiffError,
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
    onLoadDiff: onLoadFileModalDiff,
  },
});

export const buildScreenPanelProps = ({
  mode,
  connectionIssue,
  fallbackReason,
  error,
  pollingPauseReason,
  promptGitContext,
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
  worktreeSelectorEnabled = false,
  worktreeSelectorLoading = false,
  worktreeSelectorError = null,
  worktreeEntries = [],
  worktreeRepoRoot = null,
  worktreeBaseBranch = null,
  actualWorktreePath = null,
  virtualWorktreePath = null,
  handleModeChange,
  handleRefreshScreen,
  handleRefreshWorktrees,
  handleAtBottomChange,
  scrollToBottom,
  handleUserScrollStateChange,
  onSelectVirtualWorktree,
  onClearVirtualWorktree,
  onResolveFileReference,
  onResolveFileReferenceCandidates,
}: BuildScreenPanelPropsArgs) => ({
  state: {
    mode,
    connectionIssue,
    fallbackReason,
    error,
    pollingPauseReason,
    promptGitContext,
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
    worktreeSelectorEnabled,
    worktreeSelectorLoading,
    worktreeSelectorError,
    worktreeEntries,
    worktreeRepoRoot,
    worktreeBaseBranch,
    actualWorktreePath,
    virtualWorktreePath,
  },
  actions: {
    onModeChange: handleModeChange,
    onRefresh: handleRefreshScreen,
    onRefreshWorktrees: () => {
      void (handleRefreshWorktrees ?? handleRefreshScreen)();
    },
    onAtBottomChange: handleAtBottomChange,
    onScrollToBottom: scrollToBottom,
    onUserScrollStateChange: handleUserScrollStateChange,
    onSelectVirtualWorktree,
    onClearVirtualWorktree,
    onResolveFileReference,
    onResolveFileReferenceCandidates,
  },
});

export const buildQuickPanelProps = ({
  quickPanelOpen,
  sessionGroups,
  nowMs,
  paneId,
  openLogModal,
  handleOpenPaneHere,
  handleOpenPaneInNewWindow,
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
    onOpenSessionLinkInNewWindow: handleOpenPaneInNewWindow,
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

export const buildSessionHeaderProps = ({
  session,
  connectionIssue,
  nowMs,
  titleDraft,
  titleEditing,
  titleSaving,
  titleError,
  updateTitleDraft,
  saveTitle,
  resetTitle,
  openTitleEditor,
  closeTitleEditor,
  handleTouchSession,
}: BuildSessionHeaderPropsArgs) => {
  if (!session) {
    return null;
  }
  return {
    state: {
      session,
      connectionIssue,
      nowMs,
      titleDraft,
      titleEditing,
      titleSaving,
      titleError,
    },
    actions: {
      onTitleDraftChange: updateTitleDraft,
      onTitleSave: saveTitle,
      onTitleReset: resetTitle,
      onOpenTitleEditor: openTitleEditor,
      onCloseTitleEditor: closeTitleEditor,
      onTouchSession: handleTouchSession,
    },
  };
};

export const buildSessionSidebarProps = ({
  sessionGroups,
  getRepoSortAnchorAt,
  nowMs,
  connected,
  sidebarConnectionIssue,
  launchConfig,
  requestWorktrees,
  requestStateTimeline,
  requestScreen,
  highlightCorrections,
  resolvedTheme,
  paneId,
  handleFocusPane,
  handleLaunchAgentInSession,
  handleTouchPane,
  handleTouchRepoPin,
}: BuildSessionSidebarPropsArgs) => ({
  state: {
    sessionGroups,
    getRepoSortAnchorAt,
    nowMs,
    connected,
    connectionIssue: sidebarConnectionIssue,
    launchConfig,
    requestWorktrees,
    requestStateTimeline,
    requestScreen,
    highlightCorrections,
    resolvedTheme,
    currentPaneId: paneId,
    className: "border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r",
  },
  actions: {
    onFocusPane: handleFocusPane,
    onLaunchAgentInSession: handleLaunchAgentInSession,
    onTouchSession: handleTouchPane,
    onTouchRepoPin: handleTouchRepoPin,
  },
});

export const buildControlsPanelProps = ({
  interactive,
  textInputRef,
  autoEnter,
  rawMode,
  allowDangerKeys,
  isSendingText,
  shiftHeld,
  ctrlHeld,
  handleSendText,
  handleUploadImage,
  toggleAutoEnter,
  toggleRawMode,
  toggleAllowDangerKeys,
  toggleShift,
  toggleCtrl,
  handleSendKey,
  handleKillPane,
  handleKillWindow,
  handleRawBeforeInput,
  handleRawInput,
  handleRawKeyDown,
  handleRawCompositionStart,
  handleRawCompositionEnd,
}: BuildControlsPanelPropsArgs) => ({
  state: {
    interactive,
    textInputRef,
    autoEnter,
    rawMode,
    allowDangerKeys,
    isSendingText,
    shiftHeld,
    ctrlHeld,
  },
  actions: {
    onSendText: handleSendText,
    onPickImage: handleUploadImage,
    onToggleAutoEnter: toggleAutoEnter,
    onToggleRawMode: toggleRawMode,
    onToggleAllowDangerKeys: toggleAllowDangerKeys,
    onToggleShift: toggleShift,
    onToggleCtrl: toggleCtrl,
    onSendKey: handleSendKey,
    onKillPane: handleKillPane,
    onKillWindow: handleKillWindow,
    onRawBeforeInput: handleRawBeforeInput,
    onRawInput: handleRawInput,
    onRawKeyDown: handleRawKeyDown,
    onRawCompositionStart: handleRawCompositionStart,
    onRawCompositionEnd: handleRawCompositionEnd,
  },
});
