import type { SessionSummary } from "@vde-monitor/shared";

type SessionListSearchTarget = Pick<
  SessionSummary,
  "customTitle" | "title" | "sessionName" | "repoRoot" | "currentPath" | "branch" | "paneId"
>;

export const normalizeSessionListSearchQuery = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value;
};

const tokenizeSessionListSearchTerms = (query: string) =>
  normalizeSessionListSearchQuery(query)
    .toLowerCase()
    .split(/[\s\u3000]+/)
    .filter((term) => term.length > 0);

export const hasSessionListSearchTerms = (query: string) =>
  tokenizeSessionListSearchTerms(query).length > 0;

export const matchesSessionListSearch = (session: SessionListSearchTarget, query: string) => {
  const searchTerms = tokenizeSessionListSearchTerms(query);
  if (searchTerms.length === 0) {
    return true;
  }

  const searchableText = [
    session.customTitle,
    session.title,
    session.sessionName,
    session.repoRoot,
    session.currentPath,
    session.branch,
    session.paneId,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return searchTerms.every((term) => searchableText.includes(term));
};
