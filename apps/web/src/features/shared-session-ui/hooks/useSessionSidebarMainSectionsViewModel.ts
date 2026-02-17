import type { LaunchConfig, WorktreeList } from "@vde-monitor/shared";
import { useMemo } from "react";

import type { SessionListFilter } from "@/features/shared-session-ui/model/session-list-filters";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import type { SidebarRepoGroup } from "./useSessionSidebarGroups";

export type SessionSidebarListSectionViewModel = {
  onListScroll: () => void;
  sidebarGroups: SidebarRepoGroup[];
  nowMs: number;
  currentPaneId?: string | null;
  focusPendingPaneIds: Set<string>;
  launchPendingSessions: Set<string>;
  launchConfig: LaunchConfig;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  onHoverStart: (paneId: string) => void;
  onHoverEnd: (paneId: string) => void;
  onFocus: (paneId: string) => void;
  onBlur: (paneId: string) => void;
  onSelect: (paneId: string) => void;
  onFocusPane: (paneId: string) => Promise<void> | void;
  onLaunchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void> | void;
  onTouchSession: (paneId: string) => void;
  onTouchRepoPin: (repoRoot: string | null) => void;
  registerItemRef: (paneId: string, node: HTMLDivElement | null) => void;
};

export type SessionSidebarMainSectionsViewModel = {
  header: {
    totalSessions: number;
    repoCount: number;
  };
  filter: {
    value: SessionListFilter;
    onChange: (next: string) => void;
  };
  list: SessionSidebarListSectionViewModel;
};

type UseSessionSidebarMainSectionsViewModelArgs = {
  totalSessions: number;
  repoCount: number;
  filter: SessionListFilter;
  onFilterChange: (next: string) => void;
  list: SessionSidebarListSectionViewModel;
};

export const useSessionSidebarMainSectionsViewModel = ({
  totalSessions,
  repoCount,
  filter,
  onFilterChange,
  list,
}: UseSessionSidebarMainSectionsViewModelArgs): SessionSidebarMainSectionsViewModel =>
  useMemo(
    () => ({
      header: {
        totalSessions,
        repoCount,
      },
      filter: {
        value: filter,
        onChange: onFilterChange,
      },
      list,
    }),
    [filter, list, onFilterChange, repoCount, totalSessions],
  );
