import type {
  HighlightCorrectionConfig,
  SessionStateTimeline,
  SessionSummary,
} from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";

import { renderAnsiLines } from "@/lib/ansi";
import type { Theme } from "@/lib/theme";

import {
  type PreviewFrame,
  sidebarHoveredPaneIdAtom,
  sidebarPreviewFrameAtom,
} from "../atoms/sidebarPreviewAtoms";
import { selectVisibleLines } from "./sidebar-preview-geometry";
import { useSessionPreview } from "./useSessionPreview";
import { useSidebarPreviewHoverController } from "./useSidebarPreviewHoverController";
import { useSidebarPreviewTimelineCache } from "./useSidebarPreviewTimelineCache";

export type SidebarPreview = {
  paneId: string;
  sessionName: string | null;
  windowIndex: number | null;
  frame: PreviewFrame;
  title: string;
  lines: string[];
  loading: boolean;
  error: string | null;
  timeline: SessionStateTimeline | null;
  timelineLoading: boolean;
  timelineError: string | null;
};

type UseSidebarPreviewParams = {
  sessionIndex: Map<string, SessionSummary>;
  currentPaneId?: string | null;
  connected: boolean;
  connectionIssue: string | null;
  requestStateTimeline?: (
    paneId: string,
    options?: {
      scope?: "pane" | "repo";
      range?: "15m" | "1h" | "3h" | "6h" | "24h";
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<import("@vde-monitor/shared").ScreenResponse>;
  resolvedTheme: Theme;
  highlightCorrections?: HighlightCorrectionConfig;
};

type PreviewCacheMap = Partial<Record<string, { screen: string }>>;
type PreviewLoadingMap = Partial<Record<string, boolean>>;
type PreviewErrorMap = Partial<Record<string, string | null>>;

type HoveredPaneData = {
  session: SessionSummary | null;
  previewEntry: { screen: string } | null;
  previewText: string;
  loading: boolean;
  error: string | null;
};

const resolveHoveredPaneData = ({
  hoveredPaneId,
  sessionIndex,
  previewCache,
  previewLoading,
  previewError,
}: {
  hoveredPaneId: string | null;
  sessionIndex: Map<string, SessionSummary>;
  previewCache: PreviewCacheMap;
  previewLoading: PreviewLoadingMap;
  previewError: PreviewErrorMap;
}): HoveredPaneData => {
  if (!hoveredPaneId) {
    return {
      session: null,
      previewEntry: null,
      previewText: "",
      loading: false,
      error: null,
    };
  }

  const previewEntry = previewCache[hoveredPaneId] ?? null;
  return {
    session: sessionIndex.get(hoveredPaneId) ?? null,
    previewEntry,
    previewText: previewEntry?.screen ?? "",
    loading: Boolean(previewLoading[hoveredPaneId]),
    error: previewError[hoveredPaneId] ?? null,
  };
};

const resolvePreviewAgent = (session: SessionSummary | null): "codex" | "claude" | "unknown" => {
  if (session?.agent === "codex" || session?.agent === "claude") {
    return session.agent;
  }
  return "unknown";
};

const buildPreviewLines = ({
  hoveredPaneId,
  previewEntry,
  previewText,
  session,
  resolvedTheme,
  highlightCorrections,
}: {
  hoveredPaneId: string | null;
  previewEntry: { screen: string } | null;
  previewText: string;
  session: SessionSummary | null;
  resolvedTheme: Theme;
  highlightCorrections: HighlightCorrectionConfig | undefined;
}) => {
  if (!hoveredPaneId || !previewEntry) {
    return [];
  }
  const text = previewText.length > 0 ? previewText : "No log data";
  return renderAnsiLines(text, resolvedTheme, {
    agent: resolvePreviewAgent(session),
    highlightCorrections,
  });
};

const resolvePreviewTitle = (session: SessionSummary | null) => {
  if (session?.customTitle) {
    return session.customTitle;
  }
  if (session?.title) {
    return session.title;
  }
  if (session?.sessionName) {
    return session.sessionName;
  }
  return "Session";
};

const resolvePreviewSessionMeta = (session: SessionSummary | null) => {
  if (!session) {
    return {
      title: "Session",
      sessionName: null,
      windowIndex: null,
    };
  }
  return {
    title: resolvePreviewTitle(session),
    sessionName: session.sessionName,
    windowIndex: session.windowIndex,
  };
};

const buildSidebarPreview = ({
  hoveredPaneId,
  previewFrame,
  title,
  sessionName,
  windowIndex,
  lines,
  loading,
  error,
  timeline,
  timelineLoading,
  timelineError,
}: {
  hoveredPaneId: string | null;
  previewFrame: PreviewFrame | null;
  title: string;
  sessionName: string | null;
  windowIndex: number | null;
  lines: string[];
  loading: boolean;
  error: string | null;
  timeline: SessionStateTimeline | null;
  timelineLoading: boolean;
  timelineError: string | null;
}): SidebarPreview | null => {
  if (!hoveredPaneId || !previewFrame) {
    return null;
  }
  return {
    paneId: hoveredPaneId,
    sessionName,
    windowIndex,
    frame: previewFrame,
    title,
    lines,
    loading,
    error,
    timeline,
    timelineLoading,
    timelineError,
  };
};

export const useSidebarPreview = ({
  sessionIndex,
  currentPaneId,
  connected,
  connectionIssue,
  requestStateTimeline,
  requestScreen,
  resolvedTheme,
  highlightCorrections,
}: UseSidebarPreviewParams) => {
  const { previewCache, previewLoading, previewError, prefetchPreview, clearPreviewCache } =
    useSessionPreview({
      connected,
      connectionIssue,
      requestScreen,
    });
  const [hoveredPaneId, setHoveredPaneId] = useAtom(sidebarHoveredPaneIdAtom);
  const [previewFrame, setPreviewFrame] = useAtom(sidebarPreviewFrameAtom);

  const { hoveredTimeline, hoveredTimelineLoading, hoveredTimelineError, fetchTimeline } =
    useSidebarPreviewTimelineCache({
      hoveredPaneId,
      sessionIndex,
      requestStateTimeline,
    });

  const {
    handleBlur,
    handleFocus,
    handleHoverEnd,
    handleHoverStart,
    handleListScroll,
    handleSelect,
    registerItemRef,
  } = useSidebarPreviewHoverController({
    currentPaneId,
    hoveredPaneId,
    setHoveredPaneId,
    setPreviewFrame,
    prefetchPreview,
    fetchTimeline,
  });

  const hoveredPaneData = resolveHoveredPaneData({
    hoveredPaneId,
    sessionIndex,
    previewCache,
    previewLoading,
    previewError,
  });
  const hoveredSession = hoveredPaneData.session;
  const hoveredPreviewEntry = hoveredPaneData.previewEntry;
  const hoveredPreviewText = hoveredPaneData.previewText;
  const hoveredPreviewLoading = hoveredPaneData.loading;
  const hoveredPreviewError = hoveredPaneData.error;
  const hoveredPreviewLines = useMemo(() => {
    return buildPreviewLines({
      hoveredPaneId,
      previewEntry: hoveredPreviewEntry,
      previewText: hoveredPreviewText,
      session: hoveredSession,
      resolvedTheme,
      highlightCorrections,
    });
  }, [
    highlightCorrections,
    hoveredPaneId,
    hoveredPreviewEntry,
    hoveredPreviewText,
    hoveredSession,
    resolvedTheme,
  ]);

  useEffect(() => {
    if (Object.keys(previewCache).length === 0) {
      return;
    }
    const activePaneIds = new Set(sessionIndex.keys());
    Object.keys(previewCache).forEach((paneId) => {
      if (!activePaneIds.has(paneId)) {
        clearPreviewCache(paneId);
      }
    });
  }, [clearPreviewCache, previewCache, sessionIndex]);

  const previewLines = selectVisibleLines(previewFrame, hoveredPreviewLines);
  const previewSessionMeta = resolvePreviewSessionMeta(hoveredSession);
  const preview = buildSidebarPreview({
    hoveredPaneId,
    previewFrame,
    title: previewSessionMeta.title,
    sessionName: previewSessionMeta.sessionName,
    windowIndex: previewSessionMeta.windowIndex,
    lines: previewLines,
    loading: hoveredPreviewLoading,
    error: hoveredPreviewError,
    timeline: hoveredTimeline,
    timelineLoading: hoveredTimelineLoading,
    timelineError: hoveredTimelineError,
  });

  return {
    preview,
    handleHoverStart,
    handleHoverEnd,
    handleFocus,
    handleBlur,
    handleSelect,
    handleListScroll,
    registerItemRef,
  };
};

export type { PreviewFrame };
