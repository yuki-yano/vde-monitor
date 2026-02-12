import { memo } from "react";

import { FilterToggleGroup, TagPill } from "@/components/ui";
import {
  SESSION_LIST_FILTER_VALUES,
  type SessionListFilter,
} from "@/pages/SessionList/sessionListFilters";

import type { SidebarRepoGroup } from "../hooks/useSessionSidebarGroups";
import { SessionSidebarGroupList } from "./SessionSidebarGroupList";

type SessionSidebarHeaderProps = {
  totalSessions: number;
  repoCount: number;
};

const SessionSidebarHeader = memo(({ totalSessions, repoCount }: SessionSidebarHeaderProps) => (
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

SessionSidebarHeader.displayName = "SessionSidebarHeader";

const SIDEBAR_FILTER_OPTIONS = SESSION_LIST_FILTER_VALUES.map((value) => ({
  value,
  label: value.replace("_", " "),
}));

type SessionSidebarMainSectionsProps = {
  totalSessions: number;
  repoCount: number;
  filter: SessionListFilter;
  onFilterChange: (next: string) => void;
  onListScroll: () => void;
  sidebarGroups: SidebarRepoGroup[];
  nowMs: number;
  currentPaneId?: string | null;
  focusPendingPaneIds: Set<string>;
  onHoverStart: (paneId: string) => void;
  onHoverEnd: (paneId: string) => void;
  onFocus: (paneId: string) => void;
  onBlur: (paneId: string) => void;
  onSelect: (paneId: string) => void;
  onFocusPane: (paneId: string) => Promise<void> | void;
  onTouchSession: (paneId: string) => void;
  onTouchRepoPin: (repoRoot: string | null) => void;
  registerItemRef: (paneId: string, node: HTMLDivElement | null) => void;
};

export const SessionSidebarMainSections = ({
  totalSessions,
  repoCount,
  filter,
  onFilterChange,
  onListScroll,
  sidebarGroups,
  nowMs,
  currentPaneId,
  focusPendingPaneIds,
  onHoverStart,
  onHoverEnd,
  onFocus,
  onBlur,
  onSelect,
  onFocusPane,
  onTouchSession,
  onTouchRepoPin,
  registerItemRef,
}: SessionSidebarMainSectionsProps) => {
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5">
      <SessionSidebarHeader totalSessions={totalSessions} repoCount={repoCount} />
      <FilterToggleGroup
        value={filter}
        onChange={onFilterChange}
        options={SIDEBAR_FILTER_OPTIONS}
        buttonClassName="uppercase tracking-[0.14em] text-[11px] px-2.5 py-1"
      />

      <div
        className="custom-scrollbar -mr-2 min-h-0 flex-1 overflow-y-auto pr-2"
        onScroll={onListScroll}
      >
        <SessionSidebarGroupList
          sidebarGroups={sidebarGroups}
          nowMs={nowMs}
          currentPaneId={currentPaneId}
          focusPendingPaneIds={focusPendingPaneIds}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
          onFocus={onFocus}
          onBlur={onBlur}
          onSelect={onSelect}
          onFocusPane={onFocusPane}
          onTouchSession={onTouchSession}
          onTouchRepoPin={onTouchRepoPin}
          registerItemRef={registerItemRef}
        />
      </div>
    </div>
  );
};
