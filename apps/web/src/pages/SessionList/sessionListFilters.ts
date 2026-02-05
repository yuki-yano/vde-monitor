export const SESSION_LIST_FILTER_VALUES = ["ALL", "AGENT", "SHELL", "UNKNOWN"] as const;

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
