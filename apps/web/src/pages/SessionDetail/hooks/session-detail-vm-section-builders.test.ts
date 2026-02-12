import { describe, expect, it, vi } from "vitest";

import {
  buildActionsSection,
  buildLogsSection,
  buildTimelineSection,
  buildTitleSection,
} from "./session-detail-vm-section-builders";

describe("session detail vm section builders", () => {
  it("builds timeline/logs/title/actions sections", () => {
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
    const handleTouchPaneWithRepoAnchor = vi.fn();
    const handleTouchRepoPin = vi.fn();
    const handleOpenPaneHere = vi.fn();
    const handleOpenHere = vi.fn();
    const handleOpenInNewTab = vi.fn();

    const timeline = buildTimelineSection({
      timeline: null,
      timelineRange: "1h",
      timelineError: null,
      timelineLoading: false,
      timelineExpanded: true,
      isMobile: false,
      setTimelineRange,
      toggleTimelineExpanded,
      refreshTimeline,
    });
    expect(timeline.timelineRange).toBe("1h");
    expect(timeline.setTimelineRange).toBe(setTimelineRange);

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
      handleTouchPaneWithRepoAnchor,
      handleTouchRepoPin,
      handleOpenPaneHere,
      handleOpenHere,
      handleOpenInNewTab,
    });
    expect(actions.handleTouchPane).toBe(handleTouchPaneWithRepoAnchor);
    expect(actions.handleOpenInNewTab).toBe(handleOpenInNewTab);
  });
});
