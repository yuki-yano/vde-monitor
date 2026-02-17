import type {
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  SessionSummary,
} from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";

const TIMELINE_RANGE: SessionStateTimelineRange = "1h";
const TIMELINE_LIMIT = 200;

type TimelineCacheMap = Partial<Record<string, SessionStateTimeline>>;

const resolveTimelineError = (err: unknown) =>
  resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.timeline);

const isPaneLoading = (paneId: string | null, loading: Record<string, boolean>) =>
  Boolean(paneId && loading[paneId]);

const pickPaneError = (paneId: string | null, errors: Record<string, string | null>) => {
  if (!paneId) {
    return null;
  }
  return errors[paneId] ?? null;
};

const pickPaneTimeline = (paneId: string | null, cache: TimelineCacheMap) => {
  if (!paneId) {
    return null;
  }
  return cache[paneId] ?? null;
};

const prunePaneRecord = <T>(record: Record<string, T>, activePaneIds: Set<string>) => {
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return record;
  }
  const nextKeys = keys.filter((paneId) => activePaneIds.has(paneId));
  if (nextKeys.length === keys.length) {
    return record;
  }
  const nextRecord: Record<string, T> = {};
  nextKeys.forEach((paneId) => {
    nextRecord[paneId] = record[paneId] as T;
  });
  return nextRecord;
};

export const useSidebarPreviewTimelineCache = ({
  hoveredPaneId,
  sessionIndex,
  requestStateTimeline,
}: {
  hoveredPaneId: string | null;
  sessionIndex: Map<string, SessionSummary>;
  requestStateTimeline?: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
}) => {
  const [timelineCache, setTimelineCache] = useState<Record<string, SessionStateTimeline>>({});
  const [timelineLoading, setTimelineLoading] = useState<Record<string, boolean>>({});
  const [timelineError, setTimelineError] = useState<Record<string, string | null>>({});
  const timelineCacheRef = useRef<Record<string, SessionStateTimeline>>({});
  const timelineInflightRef = useRef(new Set<string>());

  useEffect(() => {
    timelineCacheRef.current = timelineCache;
  }, [timelineCache]);

  const fetchTimeline = useCallback(
    async (paneId: string) => {
      if (!requestStateTimeline || !paneId) {
        return;
      }
      if (timelineCacheRef.current[paneId] || timelineInflightRef.current.has(paneId)) {
        return;
      }
      timelineInflightRef.current.add(paneId);
      setTimelineLoading((prev) => ({ ...prev, [paneId]: true }));
      try {
        const timeline = await requestStateTimeline(paneId, {
          range: TIMELINE_RANGE,
          limit: TIMELINE_LIMIT,
        });
        setTimelineCache((prev) => ({ ...prev, [paneId]: timeline }));
        setTimelineError((prev) => ({ ...prev, [paneId]: null }));
      } catch (err) {
        setTimelineError((prev) => ({ ...prev, [paneId]: resolveTimelineError(err) }));
      } finally {
        timelineInflightRef.current.delete(paneId);
        setTimelineLoading((prev) => ({ ...prev, [paneId]: false }));
      }
    },
    [requestStateTimeline],
  );

  useEffect(() => {
    const activePaneIds = new Set(sessionIndex.keys());
    setTimelineCache((prev) => prunePaneRecord(prev, activePaneIds));
    setTimelineLoading((prev) => prunePaneRecord(prev, activePaneIds));
    setTimelineError((prev) => prunePaneRecord(prev, activePaneIds));
  }, [sessionIndex]);

  return {
    hoveredTimeline: pickPaneTimeline(hoveredPaneId, timelineCache),
    hoveredTimelineLoading: isPaneLoading(hoveredPaneId, timelineLoading),
    hoveredTimelineError: pickPaneError(hoveredPaneId, timelineError),
    fetchTimeline,
  };
};
