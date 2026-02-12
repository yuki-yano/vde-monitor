import { useMemo } from "react";

import type { SidebarPreview } from "./useSidebarPreview";

export type SessionSidebarPreviewPopoverModel = {
  frame: SidebarPreview["frame"];
  title: string;
  sessionName: string | null;
  windowIndex: number | null;
  paneId: string;
  lines: string[];
  loading: boolean;
  error: string | null;
  timeline: SidebarPreview["timeline"];
  timelineLoading: boolean;
  timelineError: string | null;
};

type UseSessionSidebarPreviewPopoverArgs = {
  preview: SidebarPreview | null;
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
