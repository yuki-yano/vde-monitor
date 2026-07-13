import type { SessionStateValue, SessionSummary } from "@vde-monitor/shared";
import { useMemo } from "react";

import { formatRepoDisplayName } from "@/lib/repo-display";
import { useSessionStreamData } from "@/state/session-context";

import {
  buildSessionGroupLabelByKey,
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

const PWA_TAB_STATE_CLASS: Record<SessionStateValue, string> = {
  RUNNING: "bg-latte-green/85",
  WAITING_INPUT: "bg-latte-peach/85",
  WAITING_PERMISSION: "bg-latte-red/85",
  DONE: "bg-latte-blue/85",
  SHELL: "bg-latte-blue/85",
  UNKNOWN: "bg-latte-overlay0/80",
};

export const resolvePwaTabStateClass = (state: SessionStateValue | null | undefined) =>
  state == null ? PWA_TAB_STATE_CLASS.UNKNOWN : PWA_TAB_STATE_CLASS[state];

const resolveSessionGroupMeta = (
  tab: WorkspaceTab,
  sessionByPaneId: Map<string, SessionSummary>,
  sessionGroupLabelByKey: Map<string, string>,
) => {
  if (tab.kind !== "session" || tab.paneId == null) {
    return { groupKey: "system", groupLabel: "SYS" };
  }
  const session = sessionByPaneId.get(tab.paneId);
  const sessionName = normalizeSessionGroupName(session?.sessionName);
  const groupKey = session == null ? `pane:${tab.paneId}` : `session:${session.sessionId}`;
  return {
    groupKey,
    groupLabel: sessionGroupLabelByKey.get(groupKey) ?? sessionName.slice(0, 4).toUpperCase(),
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

export const buildPwaWorkspaceTabGroups = (
  tabs: WorkspaceTab[],
  sessionByPaneId: Map<string, SessionSummary>,
): WorkspaceTabGroup[] => {
  const sessionGroupSources = new Map<
    string,
    { sessionName: string | null | undefined; repoRoots: Set<string> }
  >();
  tabs.forEach((tab) => {
    if (tab.kind !== "session" || tab.paneId == null) {
      return;
    }
    const session = sessionByPaneId.get(tab.paneId);
    const key = session == null ? `pane:${tab.paneId}` : `session:${session.sessionId}`;
    const source = sessionGroupSources.get(key) ?? {
      sessionName: session?.sessionName,
      repoRoots: new Set<string>(),
    };
    if (source.sessionName == null && session?.sessionName != null) {
      source.sessionName = session.sessionName;
    }
    sessionGroupSources.set(key, source);
  });
  sessionByPaneId.forEach((session) => {
    const source = sessionGroupSources.get(`session:${session.sessionId}`);
    if (source == null) return;
    if (source.sessionName == null) {
      source.sessionName = session.sessionName;
    }
    if (session.repoRoot != null) {
      source.repoRoots.add(session.repoRoot);
    }
  });
  const sessionGroups = [...sessionGroupSources].map(([key, source]) => ({
    key,
    name:
      source.repoRoots.size === 1
        ? formatRepoDisplayName(source.repoRoots.values().next().value ?? null)
        : source.sessionName,
  }));
  const sessionGroupLabelByKey = buildSessionGroupLabelByKey(sessionGroups);
  const groups = new Map<string, WorkspaceTabGroup>();
  tabs.forEach((tab) => {
    const groupMeta = resolveSessionGroupMeta(tab, sessionByPaneId, sessionGroupLabelByKey);
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
};

export const usePwaWorkspaceTabsVM = (tabs: WorkspaceTab[]) => {
  const { sessions } = useSessionStreamData();
  const sessionByPaneId = useMemo(
    () => new Map(sessions.map((session) => [session.paneId, session])),
    [sessions],
  );

  const fixedSessionsTab = tabs.find((tab) => tab.id === SYSTEM_SESSIONS_TAB_ID);
  const closableTabs = useMemo(() => tabs.filter((tab) => tab.closable), [tabs]);
  const tabGroups = useMemo(
    () => buildPwaWorkspaceTabGroups(closableTabs, sessionByPaneId),
    [closableTabs, sessionByPaneId],
  );

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
    return resolvePwaTabStateClass(sessionByPaneId.get(tab.paneId)?.state);
  };

  return {
    fixedSessionsTab,
    closableTabs,
    tabGroups,
    resolveTabLabel,
    resolveTabStateClass,
  };
};
