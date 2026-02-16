import type {
  CommitDetail,
  CommitFileDiff,
  CommitLog,
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
import type { CompositionEvent, FormEvent, KeyboardEvent, PointerEvent, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import type { ScreenMode } from "@/lib/screen-loading";
import type { SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import type { LogFileCandidateItem } from "./useSessionFiles-log-resolve-state";
import type { FileTreeRenderNode } from "./useSessionFiles-tree-utils";

type BuildTimelineSectionArgs = {
  timeline: SessionStateTimeline | null;
  timelineScope: SessionStateTimelineScope;
  timelineRange: SessionStateTimelineRange;
  hasRepoTimeline: boolean;
  timelineError: string | null;
  timelineLoading: boolean;
  timelineExpanded: boolean;
  isMobile: boolean;
  setTimelineScope: (scope: SessionStateTimelineScope) => void;
  setTimelineRange: (range: SessionStateTimelineRange) => void;
  toggleTimelineExpanded: () => void;
  refreshTimeline: () => void;
};

type BuildMetaSectionArgs = {
  paneId: string;
  session: SessionSummary | null;
  nowMs: number;
  connected: boolean;
  connectionIssue: string | null;
};

type BuildSidebarSectionArgs = {
  sessionGroups: SessionGroup[];
  getRepoSortAnchorAt: (repoRoot: string | null) => number | null;
  connected: boolean;
  connectionIssue: string | null;
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
};

type BuildLayoutSectionArgs = {
  is2xlUp: boolean;
  sidebarWidth: number;
  handleSidebarPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  detailSplitRatio: number;
  detailSplitRef: RefObject<HTMLDivElement | null>;
  handleDetailSplitPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
};

type BuildScreenSectionArgs = {
  mode: ScreenMode;
  screenLines: string[];
  imageBase64: string | null;
  fallbackReason: string | null;
  error: string | null;
  pollingPauseReason: "disconnected" | "unauthorized" | "offline" | "hidden" | null;
  contextLeftLabel: string | null;
  isScreenLoading: boolean;
  isAtBottom: boolean;
  handleAtBottomChange: (value: boolean) => void;
  handleUserScrollStateChange: (value: boolean) => void;
  forceFollow: boolean;
  scrollToBottom: (behavior: "auto" | "smooth") => void;
  handleModeChange: (mode: ScreenMode) => void;
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  handleRefreshScreen: () => void;
  handleRefreshWorktrees?: () => void | Promise<void>;
  effectiveBranch?: string | null;
  effectiveWorktreePath?: string | null;
  worktreeRepoRoot?: string | null;
  worktreeBaseBranch?: string | null;
  worktreeSelectorEnabled?: boolean;
  worktreeSelectorLoading?: boolean;
  worktreeSelectorError?: string | null;
  worktreeEntries?: WorktreeListEntry[];
  actualWorktreePath?: string | null;
  virtualWorktreePath?: string | null;
  selectVirtualWorktree?: (path: string) => void;
  clearVirtualWorktree?: () => void;
};

type BuildControlsSectionArgs = {
  interactive: boolean;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  autoEnter: boolean;
  shiftHeld: boolean;
  ctrlHeld: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  isSendingText: boolean;
  handleSendKey: (key: string) => Promise<void>;
  handleKillPane: () => Promise<void>;
  handleKillWindow: () => Promise<void>;
  handleSendText: () => Promise<void>;
  handleUploadImage: (file: File) => Promise<void>;
  handleRawBeforeInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  handleRawInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  handleRawKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleRawCompositionStart: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  handleRawCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  toggleAutoEnter: () => void;
  toggleShift: () => void;
  toggleCtrl: () => void;
  toggleRawMode: () => void;
  toggleAllowDangerKeys: () => void;
  handleTouchCurrentSession: () => void;
};

type BuildFilesSectionArgs = {
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
  fileModalOpen: boolean;
  fileModalPath: string | null;
  fileModalLoading: boolean;
  fileModalError: string | null;
  fileModalFile: RepoFileContent | null;
  fileModalMarkdownViewMode: "code" | "preview" | "diff";
  fileModalShowLineNumbers: boolean;
  fileModalCopiedPath: boolean;
  fileModalCopyError: string | null;
  fileModalHighlightLine: number | null;
  fileResolveError: string | null;
  logFileCandidateModalOpen: boolean;
  logFileCandidateReference: string | null;
  logFileCandidatePaneId: string | null;
  logFileCandidateItems: LogFileCandidateItem[];
  onSearchQueryChange: (value: string) => void;
  onSearchMove: (delta: number) => void;
  onSearchConfirm: () => void;
  onToggleDirectory: (targetPath: string) => void;
  onSelectFile: (targetPath: string) => void;
  onOpenFileModal: (targetPath: string) => void;
  onCloseFileModal: () => void;
  onSetFileModalMarkdownViewMode: (mode: "code" | "preview" | "diff") => void;
  onToggleFileModalLineNumbers: () => void;
  onCopyFileModalPath: () => Promise<void>;
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
  onSelectLogFileCandidate: (path: string) => void;
  onCloseLogFileCandidateModal: () => void;
  onLoadMoreTreeRoot: () => void;
  onLoadMoreSearch: () => void;
};

type BuildCommitsSectionArgs = {
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

type BuildNotesSectionArgs = {
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

type BuildLogsSectionArgs = {
  quickPanelOpen: boolean;
  logModalOpen: boolean;
  selectedSession: SessionSummary | null;
  selectedLogLines: string[];
  selectedLogLoading: boolean;
  selectedLogError: string | null;
  openLogModal: (paneId: string) => void;
  closeLogModal: () => void;
  toggleQuickPanel: () => void;
  closeQuickPanel: () => void;
};

type BuildTitleSectionArgs = {
  titleDraft: string;
  titleEditing: boolean;
  titleSaving: boolean;
  titleError: string | null;
  openTitleEditor: () => void;
  closeTitleEditor: () => void;
  updateTitleDraft: (value: string) => void;
  saveTitle: () => void;
  resetTitle: () => void;
};

type BuildActionsSectionArgs = {
  handleFocusPane: (targetPaneId: string) => Promise<void>;
  handleLaunchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void>;
  handleTouchPaneWithRepoAnchor: (targetPaneId: string) => void;
  handleTouchRepoPin: (repoRoot: string | null) => void;
  handleOpenPaneHere: (targetPaneId: string) => void;
  handleOpenPaneInNewWindow: (targetPaneId: string) => void;
  handleOpenHere: () => void;
  handleOpenInNewTab: () => void;
};

export const buildTimelineSection = ({
  timeline,
  timelineScope,
  timelineRange,
  hasRepoTimeline,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineScope,
  setTimelineRange,
  toggleTimelineExpanded,
  refreshTimeline,
}: BuildTimelineSectionArgs) => ({
  timeline,
  timelineScope,
  timelineRange,
  hasRepoTimeline,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineScope,
  setTimelineRange,
  toggleTimelineExpanded,
  refreshTimeline,
});

export const buildMetaSection = ({
  paneId,
  session,
  nowMs,
  connected,
  connectionIssue,
}: BuildMetaSectionArgs) => ({
  paneId,
  session,
  nowMs,
  connected,
  connectionIssue,
});

export const buildSidebarSection = ({
  sessionGroups,
  getRepoSortAnchorAt,
  connected,
  connectionIssue,
  launchConfig,
  requestWorktrees,
  requestStateTimeline,
  requestScreen,
  highlightCorrections,
  resolvedTheme,
}: BuildSidebarSectionArgs) => ({
  sessionGroups,
  getRepoSortAnchorAt,
  connected,
  connectionIssue,
  launchConfig,
  requestWorktrees,
  requestStateTimeline,
  requestScreen,
  highlightCorrections,
  resolvedTheme,
});

export const buildLayoutSection = ({
  is2xlUp,
  sidebarWidth,
  handleSidebarPointerDown,
  detailSplitRatio,
  detailSplitRef,
  handleDetailSplitPointerDown,
}: BuildLayoutSectionArgs) => ({
  is2xlUp,
  sidebarWidth,
  handleSidebarPointerDown,
  detailSplitRatio,
  detailSplitRef,
  handleDetailSplitPointerDown,
});

export const buildScreenSection = ({
  mode,
  screenLines,
  imageBase64,
  fallbackReason,
  error,
  pollingPauseReason,
  contextLeftLabel,
  isScreenLoading,
  isAtBottom,
  handleAtBottomChange,
  handleUserScrollStateChange,
  forceFollow,
  scrollToBottom,
  handleModeChange,
  virtuosoRef,
  scrollerRef,
  handleRefreshScreen,
  handleRefreshWorktrees,
  effectiveBranch = null,
  effectiveWorktreePath = null,
  worktreeRepoRoot = null,
  worktreeBaseBranch = null,
  worktreeSelectorEnabled = false,
  worktreeSelectorLoading = false,
  worktreeSelectorError = null,
  worktreeEntries = [],
  actualWorktreePath = null,
  virtualWorktreePath = null,
  selectVirtualWorktree,
  clearVirtualWorktree,
}: BuildScreenSectionArgs): BuildScreenSectionArgs => ({
  mode,
  screenLines,
  imageBase64,
  fallbackReason,
  error,
  pollingPauseReason,
  contextLeftLabel,
  isScreenLoading,
  isAtBottom,
  handleAtBottomChange,
  handleUserScrollStateChange,
  forceFollow,
  scrollToBottom,
  handleModeChange,
  virtuosoRef,
  scrollerRef,
  handleRefreshScreen,
  handleRefreshWorktrees,
  effectiveBranch,
  effectiveWorktreePath,
  worktreeRepoRoot,
  worktreeBaseBranch,
  worktreeSelectorEnabled,
  worktreeSelectorLoading,
  worktreeSelectorError,
  worktreeEntries,
  actualWorktreePath,
  virtualWorktreePath,
  selectVirtualWorktree,
  clearVirtualWorktree,
});

export const buildControlsSection = ({
  interactive,
  textInputRef,
  autoEnter,
  shiftHeld,
  ctrlHeld,
  rawMode,
  allowDangerKeys,
  isSendingText,
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
}: BuildControlsSectionArgs) => ({
  interactive,
  textInputRef,
  autoEnter,
  shiftHeld,
  ctrlHeld,
  rawMode,
  allowDangerKeys,
  isSendingText,
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
  handleTouchSession: handleTouchCurrentSession,
});

export const buildFilesSection = ({
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
  fileResolveError,
  logFileCandidateModalOpen,
  logFileCandidateReference,
  logFileCandidatePaneId,
  logFileCandidateItems,
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
}: BuildFilesSectionArgs) => ({
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
  fileResolveError,
  logFileCandidateModalOpen,
  logFileCandidateReference,
  logFileCandidatePaneId,
  logFileCandidateItems,
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

export const buildCommitsSection = ({
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
}: BuildCommitsSectionArgs) => ({
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
});

export const buildNotesSection = ({
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
}: BuildNotesSectionArgs) => ({
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
});

export const buildLogsSection = ({
  quickPanelOpen,
  logModalOpen,
  selectedSession,
  selectedLogLines,
  selectedLogLoading,
  selectedLogError,
  openLogModal,
  closeLogModal,
  toggleQuickPanel,
  closeQuickPanel,
}: BuildLogsSectionArgs) => ({
  quickPanelOpen,
  logModalOpen,
  selectedSession,
  selectedLogLines,
  selectedLogLoading,
  selectedLogError,
  openLogModal,
  closeLogModal,
  toggleQuickPanel,
  closeQuickPanel,
});

export const buildTitleSection = ({
  titleDraft,
  titleEditing,
  titleSaving,
  titleError,
  openTitleEditor,
  closeTitleEditor,
  updateTitleDraft,
  saveTitle,
  resetTitle,
}: BuildTitleSectionArgs) => ({
  titleDraft,
  titleEditing,
  titleSaving,
  titleError,
  openTitleEditor,
  closeTitleEditor,
  updateTitleDraft,
  saveTitle,
  resetTitle,
});

export const buildActionsSection = ({
  handleFocusPane,
  handleLaunchAgentInSession,
  handleTouchPaneWithRepoAnchor,
  handleTouchRepoPin,
  handleOpenPaneHere,
  handleOpenPaneInNewWindow,
  handleOpenHere,
  handleOpenInNewTab,
}: BuildActionsSectionArgs) => ({
  handleFocusPane,
  handleLaunchAgentInSession,
  handleTouchPane: handleTouchPaneWithRepoAnchor,
  handleTouchRepoPin,
  handleOpenPaneHere,
  handleOpenPaneInNewWindow,
  handleOpenHere,
  handleOpenInNewTab,
});
