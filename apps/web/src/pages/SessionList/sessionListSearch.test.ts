import { describe, expect, it } from "vitest";

import {
  hasSessionListSearchTerms,
  matchesSessionListSearch,
  normalizeSessionListSearchQuery,
} from "./sessionListSearch";

const session = {
  customTitle: "Custom API Session",
  title: "Fallback Title",
  sessionName: "session-main",
  repoRoot: "/Users/test/repos/github.com/acme/backend",
  currentPath: "/Users/test/repos/github.com/acme/backend/apps/server",
  branch: "feature/session-search",
  paneId: "%12",
};

describe("sessionListSearch", () => {
  it("normalizes unknown query values to empty", () => {
    expect(normalizeSessionListSearchQuery(undefined)).toBe("");
    expect(normalizeSessionListSearchQuery(123)).toBe("");
    expect(normalizeSessionListSearchQuery("  api  ")).toBe("  api  ");
  });

  it("detects whether query includes searchable terms", () => {
    expect(hasSessionListSearchTerms("api")).toBe(true);
    expect(hasSessionListSearchTerms(" custom  api ")).toBe(true);
    expect(hasSessionListSearchTerms("   ")).toBe(false);
    expect(hasSessionListSearchTerms("　　")).toBe(false);
  });

  it("matches known searchable fields", () => {
    expect(matchesSessionListSearch(session, "custom api")).toBe(true);
    expect(matchesSessionListSearch(session, "fallback")).toBe(true);
    expect(matchesSessionListSearch(session, "SESSION-main")).toBe(true);
    expect(matchesSessionListSearch(session, "acme/backend")).toBe(true);
    expect(matchesSessionListSearch(session, "apps/server")).toBe(true);
    expect(matchesSessionListSearch(session, "FEATURE/SESSION")).toBe(true);
    expect(matchesSessionListSearch(session, "%12")).toBe(true);
    expect(matchesSessionListSearch(session, "custom feature")).toBe(true);
    expect(matchesSessionListSearch(session, "custom　feature")).toBe(true);
  });

  it("returns true for empty query", () => {
    expect(matchesSessionListSearch(session, "")).toBe(true);
    expect(matchesSessionListSearch(session, "   ")).toBe(true);
  });

  it("does not match non-searchable values", () => {
    expect(matchesSessionListSearch(session, "permission denied")).toBe(false);
    expect(matchesSessionListSearch(session, "vim")).toBe(false);
  });
});
