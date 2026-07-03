import type { SessionSummary } from "@vde-monitor/shared";
import { useMemo } from "react";

import { useSessionStreamData } from "@/state/session-context";

import {
  buildSessionGroupLabelByName,
  normalizeSessionGroupName,
} from "../model/session-group-label";
import {
  SYSTEM_CHAT_GRID_TAB_ID,
  SYSTEM_SESSIONS_TAB_ID,
  SYSTEM_USAGE_TAB_ID,
  type WorkspaceTab,
} from "../model/workspace-tabs";

export type WorkspaceTabGroup = {
  key: string;
  label: string;
  tabs: WorkspaceTab[];
};

const resolveStateTone = (state: string | null | undefined) => {
  if (state === "RUNNING") {
    return "bg-latte-green/85";
  }
  if (state === "WAITING_INPUT") {
    return "bg-latte-peach/85";
  }
  if (state === "WAITING_PERMISSION") {
    return "bg-latte-peach/85";
  }
  if (state === "ERROR") {
    return "bg-latte-red/85";
  }
  return "bg-latte-overlay0/80";
};

const resolveSessionGroupMeta = (
  tab: WorkspaceTab,
  sessionByPaneId: Map<string, SessionSummary>,
  sessionGroupLabelByName: Map<string, string>,
) => {
  if (tab.kind !== "session" || tab.paneId == null) {
    return { groupKey: "system", groupLabel: "SYS" };
  }
  const session = sessionByPaneId.get(tab.paneId);
  const sessionName = normalizeSessionGroupName(session?.sessionName);
  return {
    groupKey: `session:${sessionName}`,
    groupLabel: sessionGroupLabelByName.get(sessionName) ?? sessionName.slice(0, 4).toUpperCase(),
  };
};

const sortWorkspaceTabGroups = (groups: WorkspaceTabGroup[]) =>
  groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftIsSystem = left.group.key === "system";
      const rightIsSystem = right.group.key === "system";
      if (leftIsSystem && !rightIsSystem) {
        return -1;
      }
      if (!leftIsSystem && rightIsSystem) {
        return 1;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.group);

export const usePwaWorkspaceTabsVM = (tabs: WorkspaceTab[]) => {
  const { sessions } = useSessionStreamData();
  const sessionByPaneId = useMemo(
    () => new Map(sessions.map((session) => [session.paneId, session])),
    [sessions],
  );

  const fixedSessionsTab = tabs.find((tab) => tab.id === SYSTEM_SESSIONS_TAB_ID);
  const closableTabs = useMemo(() => tabs.filter((tab) => tab.closable), [tabs]);
  const sessionGroupLabelByName = useMemo(() => {
    const sessionNames = closableTabs.flatMap((tab) => {
      if (tab.kind !== "session" || tab.paneId == null) {
        return [];
      }
      return [normalizeSessionGroupName(sessionByPaneId.get(tab.paneId)?.sessionName)];
    });
    return buildSessionGroupLabelByName(sessionNames);
  }, [closableTabs, sessionByPaneId]);
  const tabGroups = useMemo(() => {
    const groups = new Map<string, WorkspaceTabGroup>();
    closableTabs.forEach((tab) => {
      const groupMeta = resolveSessionGroupMeta(tab, sessionByPaneId, sessionGroupLabelByName);
      const current = groups.get(groupMeta.groupKey);
      if (current) {
        current.tabs.push(tab);
        return;
      }
      groups.set(groupMeta.groupKey, {
        key: groupMeta.groupKey,
        label: groupMeta.groupLabel,
        tabs: [tab],
      });
    });
    return sortWorkspaceTabGroups([...groups.values()]);
  }, [closableTabs, sessionByPaneId, sessionGroupLabelByName]);

  const resolveTabLabel = (tab: WorkspaceTab) => {
    if (tab.id === SYSTEM_SESSIONS_TAB_ID) {
      return "S";
    }
    if (tab.id === SYSTEM_CHAT_GRID_TAB_ID) {
      return "G";
    }
    if (tab.id === SYSTEM_USAGE_TAB_ID) {
      return "U";
    }
    if (tab.kind === "session" && tab.paneId != null) {
      const session = sessionByPaneId.get(tab.paneId);
      if (!session) {
        return tab.paneId;
      }
      const hasWindowIndex =
        typeof session.windowIndex === "number" && Number.isFinite(session.windowIndex);
      const hasPaneIndex =
        typeof session.paneIndex === "number" && Number.isFinite(session.paneIndex);
      if (hasWindowIndex && hasPaneIndex) {
        return `${session.windowIndex}-${session.paneIndex}`;
      }
      return tab.paneId;
    }
    return "T";
  };

  const resolveTabStateClass = (tab: WorkspaceTab) => {
    if (tab.kind !== "session" || tab.paneId == null) {
      return "bg-latte-blue/85";
    }
    return resolveStateTone(sessionByPaneId.get(tab.paneId)?.state);
  };

  return {
    fixedSessionsTab,
    closableTabs,
    tabGroups,
    resolveTabLabel,
    resolveTabStateClass,
  };
};
