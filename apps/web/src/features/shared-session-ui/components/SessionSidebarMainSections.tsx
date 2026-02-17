import { memo } from "react";

import { FilterToggleGroup, TagPill } from "@/components/ui";
import type {
  SessionSidebarListSectionViewModel,
  SessionSidebarMainSectionsViewModel,
} from "@/features/shared-session-ui/hooks/useSessionSidebarMainSectionsViewModel";
import {
  SESSION_LIST_FILTER_VALUES,
  type SessionListFilter,
} from "@/features/shared-session-ui/model/session-list-filters";

import { SessionSidebarGroupList } from "./SessionSidebarGroupList";

type SessionSidebarHeaderProps = {
  totalSessions: number;
  repoCount: number;
};

const SessionSidebarHeader = memo(({ totalSessions, repoCount }: SessionSidebarHeaderProps) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-latte-subtext0 text-[10px] tracking-[0.25em]">VDE Monitor</p>
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

type SessionSidebarFilterSectionProps = {
  filter: SessionListFilter;
  onFilterChange: (next: string) => void;
};

const SessionSidebarFilterSection = ({
  filter,
  onFilterChange,
}: SessionSidebarFilterSectionProps) => (
  <FilterToggleGroup
    value={filter}
    onChange={onFilterChange}
    options={SIDEBAR_FILTER_OPTIONS}
    buttonClassName="uppercase tracking-[0.14em] text-[11px] px-2.5 py-1"
  />
);

type SessionSidebarListSectionProps = {
  list: SessionSidebarListSectionViewModel;
};

const SessionSidebarListSection = ({ list }: SessionSidebarListSectionProps) => (
  <div
    className="custom-scrollbar -mr-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2"
    onScroll={list.onListScroll}
  >
    <SessionSidebarGroupList
      sidebarGroups={list.sidebarGroups}
      nowMs={list.nowMs}
      currentPaneId={list.currentPaneId}
      focusPendingPaneIds={list.focusPendingPaneIds}
      launchPendingSessions={list.launchPendingSessions}
      launchConfig={list.launchConfig}
      requestWorktrees={list.requestWorktrees}
      onHoverStart={list.onHoverStart}
      onHoverEnd={list.onHoverEnd}
      onFocus={list.onFocus}
      onBlur={list.onBlur}
      onSelect={list.onSelect}
      onFocusPane={list.onFocusPane}
      onLaunchAgentInSession={list.onLaunchAgentInSession}
      onTouchSession={list.onTouchSession}
      onTouchRepoPin={list.onTouchRepoPin}
      registerItemRef={list.registerItemRef}
    />
  </div>
);

type SessionSidebarMainSectionsProps = {
  viewModel: SessionSidebarMainSectionsViewModel;
};

export const SessionSidebarMainSections = ({ viewModel }: SessionSidebarMainSectionsProps) => {
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5">
      <SessionSidebarHeader
        totalSessions={viewModel.header.totalSessions}
        repoCount={viewModel.header.repoCount}
      />
      <SessionSidebarFilterSection
        filter={viewModel.filter.value}
        onFilterChange={viewModel.filter.onChange}
      />
      <SessionSidebarListSection list={viewModel.list} />
    </div>
  );
};
