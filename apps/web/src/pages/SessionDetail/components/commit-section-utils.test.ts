import type { CommitFileDiff, CommitLog } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import {
  buildRenderedPatches,
  formatCommitCountDescription,
  isCommitListEmpty,
  shouldShowLoadMore,
} from "./commit-section-utils";

const createCommitLog = (overrides: Partial<CommitLog> = {}): CommitLog => ({
  repoRoot: "/repo",
  rev: "HEAD",
  generatedAt: new Date(0).toISOString(),
  commits: [],
  ...overrides,
});

describe("commit-section-utils", () => {
  it("formats commit count description", () => {
    expect(formatCommitCountDescription(null)).toBe("0/0 commits");
    expect(
      formatCommitCountDescription(createCommitLog({ commits: [{} as never], totalCount: 1 })),
    ).toBe("1/1 commit");
    expect(
      formatCommitCountDescription(createCommitLog({ commits: [{}, {}] as never, totalCount: 3 })),
    ).toBe("2/3 commits");
  });

  it("builds rendered patches only for open files with patch", () => {
    const detail: CommitFileDiff = {
      path: "src/a.ts",
      status: "M",
      patch: "a\nb",
      binary: false,
      truncated: false,
    };
    expect(
      buildRenderedPatches(
        {
          "h:src/a.ts": true,
          "h:src/b.ts": false,
        },
        {
          "h:src/a.ts": detail,
        },
      ),
    ).toEqual({
      "h:src/a.ts": ["a", "b"],
    });
  });

  it("evaluates empty state and load more state", () => {
    expect(isCommitListEmpty(null)).toBe(false);
    expect(isCommitListEmpty(createCommitLog({ commits: [] }))).toBe(true);
    expect(isCommitListEmpty(createCommitLog({ commits: [], reason: "not_git" }))).toBe(false);

    expect(shouldShowLoadMore(null, true)).toBe(false);
    expect(shouldShowLoadMore(createCommitLog({ reason: "error" }), true)).toBe(false);
    expect(shouldShowLoadMore(createCommitLog({ commits: [] }), true)).toBe(true);
    expect(shouldShowLoadMore(createCommitLog({ commits: [] }), false)).toBe(false);
  });
});
