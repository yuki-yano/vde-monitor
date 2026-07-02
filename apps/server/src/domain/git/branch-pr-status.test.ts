import { describe, expect, it } from "vitest";

import { parseGhPrListOutput } from "./branch-pr-status";

describe("parseGhPrListOutput", () => {
  it("maps headRefName to pr info", () => {
    const raw = JSON.stringify([
      {
        number: 12,
        state: "OPEN",
        url: "https://github.com/o/r/pull/12",
        headRefName: "feature/foo",
      },
      { number: 8, state: "MERGED", url: "https://github.com/o/r/pull/8", headRefName: "fix/bar" },
      { number: 5, state: "CLOSED", url: "https://github.com/o/r/pull/5", headRefName: "old/baz" },
    ]);
    const map = parseGhPrListOutput(raw);
    expect(map.get("feature/foo")).toEqual({
      state: "open",
      url: "https://github.com/o/r/pull/12",
      number: 12,
    });
    expect(map.get("fix/bar")?.state).toBe("merged");
    expect(map.get("old/baz")?.state).toBe("closed_unmerged");
  });

  it("prefers open over closed for the same branch", () => {
    const raw = JSON.stringify([
      { number: 5, state: "CLOSED", url: "u5", headRefName: "feature/foo" },
      { number: 12, state: "OPEN", url: "u12", headRefName: "feature/foo" },
    ]);
    expect(parseGhPrListOutput(raw).get("feature/foo")?.number).toBe(12);
  });

  it("returns empty map on invalid json", () => {
    expect(parseGhPrListOutput("not json").size).toBe(0);
  });
});
