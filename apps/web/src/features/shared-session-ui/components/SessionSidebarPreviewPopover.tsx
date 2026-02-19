import type { SessionStateTimeline, SessionStateValue } from "@vde-monitor/shared";
import { memo, useMemo } from "react";

import { TagPill } from "@/components/ui";
import { formatStateLabel } from "@/lib/session-format";

import { buildTimelineDisplay } from "./state-timeline-display";

type PreviewFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  lines: number;
};

type SessionSidebarPreviewPopoverProps = {
  frame: PreviewFrame;
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

const SEGMENT_COLOR_CLASS: Record<SessionStateValue, string> = {
  RUNNING: "bg-latte-green/80",
  WAITING_INPUT: "bg-latte-peach/80",
  WAITING_PERMISSION: "bg-latte-red/80",
  SHELL: "bg-latte-blue/80",
  UNKNOWN: "bg-latte-overlay0/80",
};

const resolveSegmentWidthPercent = (durationMs: number, totalDurationMs: number) => {
  if (durationMs <= 0 || totalDurationMs <= 0) {
    return 0;
  }
  return (durationMs / totalDurationMs) * 100;
};

const sanitizePreviewHtml = (value: string) => {
  const html = value || "&#x200B;";
  if (typeof DOMParser === "undefined") {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blockedElements = doc.body.querySelectorAll("script,style,iframe,object,embed");
  blockedElements.forEach((element) => {
    element.remove();
  });
  const elements = doc.body.querySelectorAll<HTMLElement>("*");
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const valueLower = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if ((name === "href" || name === "src") && valueLower.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return doc.body.innerHTML || "&#x200B;";
};

const SessionPreviewMeta = ({
  sessionName,
  windowIndex,
}: {
  sessionName: string | null;
  windowIndex: number | null;
}) => (
  <div className="mt-1 flex flex-wrap items-center gap-1.5">
    {sessionName && <TagPill tone="meta">Session {sessionName}</TagPill>}
    {windowIndex != null && <TagPill tone="meta">Window {windowIndex}</TagPill>}
  </div>
);

const SessionPreviewTimeline = ({
  timeline,
  timelineLoading,
  timelineError,
}: {
  timeline: SessionStateTimeline | null;
  timelineLoading: boolean;
  timelineError: string | null;
}) => {
  const timelineDisplay = useMemo(
    () => buildTimelineDisplay(timeline, timeline?.range ?? "1h", { compact: true }),
    [timeline],
  );
  const timelineSegments = useMemo(() => {
    const items = [...timelineDisplay.items]
      .filter((item) => item.durationMs > 0)
      .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
    const totalDurationMs = items.reduce((total, item) => total + item.durationMs, 0);
    return items.map((item) => ({
      id: item.id,
      state: item.state,
      width: resolveSegmentWidthPercent(item.durationMs, totalDurationMs),
    }));
  }, [timelineDisplay.items]);
  const currentLabel = timelineDisplay.current
    ? formatStateLabel(timelineDisplay.current.state)
    : null;

  return (
    <div className="border-latte-surface1/80 bg-latte-mantle shadow-inner-highlight rounded-xl border px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <TagPill tone="meta">State Timeline</TagPill>
        <TagPill tone="meta">Range {timeline?.range ?? "1h"}</TagPill>
        {currentLabel ? <TagPill tone="meta">Current {currentLabel}</TagPill> : null}
      </div>
      {timelineError ? (
        <p className="text-latte-red text-xs">{timelineError}</p>
      ) : timelineLoading && !timeline ? (
        <p className="text-latte-subtext0 text-xs">Loading timeline...</p>
      ) : timelineSegments.length > 0 ? (
        <div className="border-latte-surface2 bg-latte-surface0 flex h-2 overflow-hidden rounded-full border">
          {timelineSegments.map((segment) => (
            <div
              key={segment.id}
              className={SEGMENT_COLOR_CLASS[segment.state]}
              style={{ width: `${segment.width}%` }}
            />
          ))}
        </div>
      ) : (
        <p className="text-latte-subtext0 text-xs">No timeline events in this range.</p>
      )}
    </div>
  );
};

const SessionPreviewBody = ({
  lines,
  loading,
  error,
  timeline,
  timelineLoading,
  timelineError,
}: {
  lines: string[];
  loading: boolean;
  error: string | null;
  timeline: SessionStateTimeline | null;
  timelineLoading: boolean;
  timelineError: string | null;
}) => {
  const previewLineRows = useMemo(() => {
    const lineCounts = new Map<string, number>();
    return lines.map((line) => {
      const count = lineCounts.get(line) ?? 0;
      lineCounts.set(line, count + 1);
      return {
        key: `preview-line-${line}-${count}`,
        line: sanitizePreviewHtml(line),
      };
    });
  }, [lines]);
  const previewBodyClassName =
    "border-latte-surface1/80 bg-latte-crust text-latte-text min-h-0 flex-1 overflow-hidden rounded-xl border px-3 py-3 font-mono text-[12px] leading-[16px]";
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
      <SessionPreviewTimeline
        timeline={timeline}
        timelineLoading={timelineLoading}
        timelineError={timelineError}
      />
      <div className={previewBodyClassName}>
        {loading ? (
          <p className="text-latte-subtext0 text-xs">Loading preview...</p>
        ) : error ? (
          <p className="text-latte-red text-xs">{error}</p>
        ) : lines.length === 0 ? (
          <p className="text-latte-subtext0 text-xs">Preview unavailable.</p>
        ) : (
          <div className="flex min-h-full flex-col justify-end">
            {previewLineRows.map((item) => (
              <div
                key={item.key}
                className="whitespace-pre"
                dangerouslySetInnerHTML={{ __html: item.line || "&#x200B;" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const SessionSidebarPreviewPopover = memo(
  ({
    frame,
    title,
    sessionName,
    windowIndex,
    paneId,
    lines,
    loading,
    error,
    timeline,
    timelineLoading,
    timelineError,
  }: SessionSidebarPreviewPopoverProps) => (
    <div
      className="pointer-events-none fixed z-50 hidden -translate-y-1/2 md:block"
      style={{
        left: frame.left,
        top: frame.top,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
      }}
      aria-hidden="true"
    >
      <div className="border-latte-surface1/80 bg-latte-base shadow-popover relative flex h-full flex-col rounded-2xl border p-4">
        <div className="from-latte-lavender/12 absolute inset-x-0 top-0 h-14 rounded-t-2xl bg-gradient-to-b to-transparent" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-latte-subtext0 text-[10px] uppercase tracking-[0.28em]">
              Live Preview
            </p>
            <p className="text-latte-text truncate text-sm font-semibold">{title}</p>
          </div>
          <TagPill tone="meta">Pane {paneId}</TagPill>
        </div>
        <SessionPreviewMeta sessionName={sessionName} windowIndex={windowIndex} />
        <div className="border-latte-surface1/80 mt-2 border-t" />
        <SessionPreviewBody
          lines={lines}
          loading={loading}
          error={error}
          timeline={timeline}
          timelineLoading={timelineLoading}
          timelineError={timelineError}
        />
        <div className="border-latte-surface1/80 bg-latte-base absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t" />
      </div>
    </div>
  ),
);

SessionSidebarPreviewPopover.displayName = "SessionSidebarPreviewPopover";
