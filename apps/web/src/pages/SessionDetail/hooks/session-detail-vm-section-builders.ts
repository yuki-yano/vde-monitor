import type {
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionSummary,
} from "@vde-monitor/shared";

type BuildTimelineSectionArgs = {
  timeline: SessionStateTimeline | null;
  timelineRange: SessionStateTimelineRange;
  timelineError: string | null;
  timelineLoading: boolean;
  timelineExpanded: boolean;
  isMobile: boolean;
  setTimelineRange: (range: SessionStateTimelineRange) => void;
  toggleTimelineExpanded: () => void;
  refreshTimeline: () => void;
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
  handleTouchPaneWithRepoAnchor: (targetPaneId: string) => void;
  handleTouchRepoPin: (repoRoot: string | null) => void;
  handleOpenPaneHere: (targetPaneId: string) => void;
  handleOpenHere: () => void;
  handleOpenInNewTab: () => void;
};

export const buildTimelineSection = ({
  timeline,
  timelineRange,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineRange,
  toggleTimelineExpanded,
  refreshTimeline,
}: BuildTimelineSectionArgs) => ({
  timeline,
  timelineRange,
  timelineError,
  timelineLoading,
  timelineExpanded,
  isMobile,
  setTimelineRange,
  toggleTimelineExpanded,
  refreshTimeline,
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
  handleTouchPaneWithRepoAnchor,
  handleTouchRepoPin,
  handleOpenPaneHere,
  handleOpenHere,
  handleOpenInNewTab,
}: BuildActionsSectionArgs) => ({
  handleFocusPane,
  handleTouchPane: handleTouchPaneWithRepoAnchor,
  handleTouchRepoPin,
  handleOpenPaneHere,
  handleOpenHere,
  handleOpenInNewTab,
});
