import type { SessionSummary } from "@vde-monitor/shared";

import { isEditorCommand } from "@/lib/session-format";

export const SESSION_LIST_FILTER_VALUES = ["ALL", "AGENT", "EDITOR", "SHELL", "UNKNOWN"] as const;

export type SessionListFilter = (typeof SESSION_LIST_FILTER_VALUES)[number];

export const DEFAULT_SESSION_LIST_FILTER: SessionListFilter = "AGENT";

const SESSION_LIST_FILTER_STORAGE_KEY = "vde-monitor-session-list-filter";

export const isSessionListFilter = (value: unknown): value is SessionListFilter => {
  return (
    typeof value === "string" && SESSION_LIST_FILTER_VALUES.includes(value as SessionListFilter)
  );
};

export const readStoredSessionListFilter = (): SessionListFilter => {
  if (typeof window === "undefined") return DEFAULT_SESSION_LIST_FILTER;
  const stored = window.sessionStorage.getItem(SESSION_LIST_FILTER_STORAGE_KEY);
  return isSessionListFilter(stored) ? stored : DEFAULT_SESSION_LIST_FILTER;
};

export const storeSessionListFilter = (filter: SessionListFilter) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_LIST_FILTER_STORAGE_KEY, filter);
};

export const matchesSessionListFilter = (
  session: Pick<SessionSummary, "state" | "currentCommand">,
  filter: SessionListFilter,
) => {
  if (filter === "ALL") {
    return true;
  }
  if (filter === "EDITOR") {
    return isEditorCommand(session.currentCommand);
  }
  if (filter === "AGENT") {
    return session.state !== "SHELL" && session.state !== "UNKNOWN";
  }
  return session.state === filter;
};
