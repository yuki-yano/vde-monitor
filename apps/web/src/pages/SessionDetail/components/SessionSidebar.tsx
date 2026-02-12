import type {
  HighlightCorrectionConfig,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionSummary,
} from "@vde-monitor/shared";
import { memo, useCallback, useMemo, useState } from "react";

import { Card, FilterToggleGroup, TagPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { buildSessionGroups, type SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";
import {
  buildSessionWindowGroups,
  type SessionWindowGroup,
} from "@/pages/SessionList/session-window-group";
import {
  DEFAULT_SESSION_LIST_FILTER,
  isSessionListFilter,
  matchesSessionListFilter,
  SESSION_LIST_FILTER_VALUES,
  type SessionListFilter,
} from "@/pages/SessionList/sessionListFilters";

import { useSidebarPreview } from "../hooks/useSidebarPreview";
import { SessionSidebarGroupList } from "./SessionSidebarGroupList";
import { SessionSidebarPreviewPopover } from "./SessionSidebarPreviewPopover";

type SessionSidebarState = {
  sessionGroups: SessionGroup[];
  getRepoSortAnchorAt?: (repoRoot: string | null) => number | null;
  nowMs: number;
  connected: boolean;
  connectionIssue: string | null;
  requestStateTimeline: (
    paneId: string,
    options?: { range?: SessionStateTimelineRange; limit?: number },
  ) => Promise<SessionStateTimeline>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  highlightCorrections: HighlightCorrectionConfig;
  resolvedTheme: Theme;
  currentPaneId?: string | null;
  className?: string;
};

type SessionSidebarActions = {
  onSelectSession?: (paneId: string) => void;
  onFocusPane?: (paneId: string) => Promise<void> | void;
  onTouchSession?: (paneId: string) => void;
  onTouchRepoPin?: (repoRoot: string | null) => void;
};

type SessionSidebarProps = {
  state: SessionSidebarState;
  actions: SessionSidebarActions;
};

const SidebarBackdrop = memo(() => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-none rounded-r-3xl">
    <div className="bg-latte-lavender/15 absolute -left-10 top-10 h-32 w-32 rounded-full blur-3xl" />
    <div className="bg-latte-peach/15 absolute -right-12 top-40 h-36 w-36 rounded-full blur-3xl" />
    <div className="from-latte-lavender/70 via-latte-peach/40 absolute left-0 top-0 h-full w-[2px] bg-gradient-to-b to-transparent" />
    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/5 to-transparent" />
  </div>
));

SidebarBackdrop.displayName = "SidebarBackdrop";

type SidebarHeaderProps = {
  totalSessions: number;
  repoCount: number;
};

const SidebarHeader = memo(({ totalSessions, repoCount }: SidebarHeaderProps) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-latte-subtext0 text-[10px] uppercase tracking-[0.45em]">vde-monitor</p>
      <h2 className="font-display text-latte-text text-xl font-semibold">Live Sessions</h2>
    </div>
    <div className="flex flex-col items-end gap-2">
      <TagPill tone="neutral" className="bg-latte-crust/70">
        {totalSessions} Active
      </TagPill>
      <span className="text-latte-subtext0 text-[10px] uppercase tracking-[0.3em]">
        {repoCount} repos
      </span>
    </div>
  </div>
));

SidebarHeader.displayName = "SidebarHeader";

const SIDEBAR_FILTER_OPTIONS = SESSION_LIST_FILTER_VALUES.map((value) => ({
  value,
  label: value.replace("_", " "),
}));

export const SessionSidebar = ({ state, actions }: SessionSidebarProps) => {
  const {
    sessionGroups,
    getRepoSortAnchorAt,
    nowMs,
    connected,
    connectionIssue,
    requestStateTimeline,
    requestScreen,
    highlightCorrections,
    resolvedTheme,
    currentPaneId,
    className,
  } = state;
  const { onSelectSession, onFocusPane, onTouchSession, onTouchRepoPin } = actions;
  const [filter, setFilter] = useState<SessionListFilter>(DEFAULT_SESSION_LIST_FILTER);
  const [focusPendingPaneIds, setFocusPendingPaneIds] = useState<Set<string>>(() => new Set());

  const filteredSessions = useMemo(
    () =>
      sessionGroups
        .flatMap((group) => group.sessions)
        .filter((session) => matchesSessionListFilter(session, filter)),
    [filter, sessionGroups],
  );

  const filteredSessionGroups = useMemo(() => {
    return buildSessionGroups(filteredSessions, { getRepoSortAnchorAt });
  }, [filteredSessions, getRepoSortAnchorAt]);

  const sidebarGroups = useMemo(() => {
    return filteredSessionGroups
      .map((group) => {
        const windowGroups = buildSessionWindowGroups(group.sessions);
        if (windowGroups.length === 0) {
          return null;
        }
        return {
          repoRoot: group.repoRoot,
          windowGroups,
        };
      })
      .filter(
        (
          group,
        ): group is { repoRoot: SessionGroup["repoRoot"]; windowGroups: SessionWindowGroup[] } =>
          Boolean(group),
      );
  }, [filteredSessionGroups]);

  const { totalSessions, repoCount, sessionIndex } = useMemo(() => {
    let total = 0;
    const map = new Map<string, SessionSummary>();
    sidebarGroups.forEach((group) => {
      group.windowGroups.forEach((windowGroup) => {
        total += windowGroup.sessions.length;
        windowGroup.sessions.forEach((session) => {
          map.set(session.paneId, session);
        });
      });
    });
    return { totalSessions: total, repoCount: sidebarGroups.length, sessionIndex: map };
  }, [sidebarGroups]);

  const {
    preview,
    handleHoverStart,
    handleHoverEnd,
    handleFocus,
    handleBlur,
    handleSelect: handlePreviewSelect,
    handleListScroll,
    registerItemRef,
  } = useSidebarPreview({
    sessionIndex,
    currentPaneId,
    connected,
    connectionIssue,
    requestStateTimeline,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const handleSelect = useCallback(
    (paneId: string) => {
      onSelectSession?.(paneId);
      handlePreviewSelect();
    },
    [handlePreviewSelect, onSelectSession],
  );

  const handleFocusPane = useCallback(
    async (paneId: string) => {
      if (!onFocusPane) {
        return;
      }
      setFocusPendingPaneIds((prev) => {
        if (prev.has(paneId)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(paneId);
        return next;
      });
      try {
        await onFocusPane(paneId);
      } catch {
        // Best-effort UI action: ignore unexpected handler failures.
      } finally {
        setFocusPendingPaneIds((prev) => {
          if (!prev.has(paneId)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(paneId);
          return next;
        });
      }
    },
    [onFocusPane],
  );

  const handleFilterChange = useCallback((next: string) => {
    if (!isSessionListFilter(next)) {
      setFilter(DEFAULT_SESSION_LIST_FILTER);
      return;
    }
    setFilter(next);
  }, []);

  const handleTouchRepoPin = useCallback(
    (repoRoot: string | null) => {
      onTouchRepoPin?.(repoRoot);
    },
    [onTouchRepoPin],
  );

  const handleTouchPane = useCallback(
    (paneId: string) => {
      onTouchSession?.(paneId);
    },
    [onTouchSession],
  );

  return (
    <Card
      className={cn(
        "border-latte-surface1/70 bg-latte-mantle/80 relative flex h-full flex-col p-4 shadow-[0_18px_50px_-25px_rgba(17,17,27,0.6)]",
        className,
      )}
    >
      <SidebarBackdrop />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5">
        <SidebarHeader totalSessions={totalSessions} repoCount={repoCount} />
        <FilterToggleGroup
          value={filter}
          onChange={handleFilterChange}
          options={SIDEBAR_FILTER_OPTIONS}
          buttonClassName="uppercase tracking-[0.14em] text-[11px] px-2.5 py-1"
        />

        <div
          className="custom-scrollbar -mr-2 min-h-0 flex-1 overflow-y-auto pr-2"
          onScroll={handleListScroll}
        >
          <SessionSidebarGroupList
            sidebarGroups={sidebarGroups}
            nowMs={nowMs}
            currentPaneId={currentPaneId}
            focusPendingPaneIds={focusPendingPaneIds}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSelect={handleSelect}
            onFocusPane={handleFocusPane}
            onTouchSession={handleTouchPane}
            onTouchRepoPin={handleTouchRepoPin}
            registerItemRef={registerItemRef}
          />
        </div>
      </div>

      {preview && preview.paneId !== currentPaneId && (
        <SessionSidebarPreviewPopover
          frame={preview.frame}
          title={preview.title}
          sessionName={preview.sessionName}
          windowIndex={preview.windowIndex}
          paneId={preview.paneId}
          lines={preview.lines}
          loading={preview.loading}
          error={preview.error ?? null}
          timeline={preview.timeline}
          timelineLoading={preview.timelineLoading}
          timelineError={preview.timelineError}
        />
      )}
    </Card>
  );
};
