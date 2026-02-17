import type { SessionStateTimeline } from "@vde-monitor/shared";
import { useMemo } from "react";

type SessionSidebarPreviewPopoverModel = {
  frame: {
    left: number;
    top: number;
    width: number;
    height: number;
    lines: number;
  };
  title: string;
  sessionName: string | null;
  windowIndex: number | null;
  paneId: string;
  lines: string[];
  loading: boolean;
  error: string | null;
  timeline: SessionStateTimeline | null;
  timelineLoading: boolean;
  timelineError: string | null;
};

type SidebarPreviewInput = {
  paneId: string;
  frame: {
    left: number;
    top: number;
    width: number;
    height: number;
    lines: number;
  };
  title: string;
  sessionName: string | null;
  windowIndex: number | null;
  lines: string[];
  loading: boolean;
  error: string | null;
  timeline: SessionStateTimeline | null;
  timelineLoading: boolean;
  timelineError: string | null;
};

type UseSessionSidebarPreviewPopoverArgs = {
  preview: SidebarPreviewInput | null;
  currentPaneId?: string | null;
};

export const useSessionSidebarPreviewPopover = ({
  preview,
  currentPaneId,
}: UseSessionSidebarPreviewPopoverArgs): SessionSidebarPreviewPopoverModel | null => {
  return useMemo(() => {
    if (!preview || preview.paneId === currentPaneId) {
      return null;
    }

    return {
      frame: preview.frame,
      title: preview.title,
      sessionName: preview.sessionName,
      windowIndex: preview.windowIndex,
      paneId: preview.paneId,
      lines: preview.lines,
      loading: preview.loading,
      error: preview.error,
      timeline: preview.timeline,
      timelineLoading: preview.timelineLoading,
      timelineError: preview.timelineError,
    };
  }, [currentPaneId, preview]);
};
