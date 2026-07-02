import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runGit: vi.fn(),
}));

vi.mock("./git-utils", () => ({
  runGit: mocks.runGit,
}));

import {
  parseAheadBehindOutput,
  parseBranchDiffStats,
  parseForEachRefBranches,
  parseMergedBranchNames,
  parseWorktreeBranchMap,
  resolveDefaultBranch,
  sortBranchEntries,
} from "./git-branches";

afterEach(() => {
  vi.clearAllMocks();
});

describe("parseForEachRefBranches", () => {
  it("parses name, committedAt, and HEAD marker", () => {
    const output = [
      "main\x002026-07-01T10:00:00+09:00\x00*",
      "feature/foo\x002026-06-30T09:00:00+09:00\x00 ",
      "",
    ].join("\n");
    expect(parseForEachRefBranches(output)).toEqual([
      { name: "main", committedAt: "2026-07-01T10:00:00+09:00", current: true },
      { name: "feature/foo", committedAt: "2026-06-30T09:00:00+09:00", current: false },
    ]);
  });

  it("returns empty array for empty output", () => {
    expect(parseForEachRefBranches("")).toEqual([]);
  });
});

describe("parseWorktreeBranchMap", () => {
  it("maps branch names to worktree paths", () => {
    const output = [
      "worktree /repo",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo/.vde/worktree/feature-foo",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/feature/foo",
      "",
      "worktree /repo/.vde/worktree/detached",
      "HEAD 3333333333333333333333333333333333333333",
      "detached",
      "",
    ].join("\n");
    const map = parseWorktreeBranchMap(output);
    expect(map.get("main")).toBe("/repo");
    expect(map.get("feature/foo")).toBe("/repo/.vde/worktree/feature-foo");
    expect(map.size).toBe(2);
  });
});

describe("parseMergedBranchNames", () => {
  it("strips markers and whitespace", () => {
    const output = ["  main", "* feature/foo", "+ linked/bar", ""].join("\n");
    expect(parseMergedBranchNames(output)).toEqual(new Set(["main", "feature/foo", "linked/bar"]));
  });
});

describe("sortBranchEntries", () => {
  const entry = (name: string, committedAt: string | null, isDefault = false) => ({
    name,
    current: false,
    isDefault,
    ahead: null,
    behind: null,
    fileChanges: null,
    additions: null,
    deletions: null,
    merged: null,
    pr: null,
    worktreePath: null,
    committedAt,
  });

  it("puts default branch first, then committedAt desc", () => {
    const sorted = sortBranchEntries([
      entry("old", "2026-01-01T00:00:00+09:00"),
      entry("main", "2026-05-01T00:00:00+09:00", true),
      entry("new", "2026-07-01T00:00:00+09:00"),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["main", "new", "old"]);
  });

  it("sorts null committedAt last", () => {
    const sorted = sortBranchEntries([
      entry("nodate", null),
      entry("dated", "2026-07-01T00:00:00+09:00"),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["dated", "nodate"]);
  });
});

describe("parseAheadBehindOutput", () => {
  it("maps '<behind>\\t<ahead>' output to { ahead, behind }", () => {
    // `git rev-list --left-right --count base...branch` prints
    // `<left(behind)> <right(ahead)>`.
    expect(parseAheadBehindOutput("2\t5")).toEqual({ ahead: 5, behind: 2 });
  });

  it("maps space-separated output to { ahead, behind }", () => {
    expect(parseAheadBehindOutput("0 3")).toEqual({ ahead: 3, behind: 0 });
  });

  it("returns nulls for malformed input", () => {
    expect(parseAheadBehindOutput("")).toEqual({ ahead: null, behind: null });
    expect(parseAheadBehindOutput("not-a-number")).toEqual({ ahead: null, behind: null });
    expect(parseAheadBehindOutput("1")).toEqual({ ahead: null, behind: null });
  });
});

describe("parseBranchDiffStats", () => {
  it("counts A/M/D/R name-status lines and sums numstat totals", () => {
    const nameStatusOutput = [
      "A\tfile-a.txt",
      "M\tfile-b.txt",
      "D\tfile-c.txt",
      "R100\told.txt\tnew.txt",
    ].join("\n");
    const numstatOutput = [
      "3\t1\tfile-a.txt",
      "2\t2\tfile-b.txt",
      "0\t5\tfile-c.txt",
      "4\t0\tnew.txt",
    ].join("\n");

    const stats = parseBranchDiffStats(nameStatusOutput, numstatOutput);

    expect(stats.fileChanges).toEqual({ add: 1, m: 2, d: 1 });
    expect(stats.additions).toBe(9);
    expect(stats.deletions).toBe(8);
  });

  it("skips binary numstat lines (marked with -) when totaling additions/deletions", () => {
    const nameStatusOutput = "M\tbinary.png";
    const numstatOutput = "-\t-\tbinary.png";

    const stats = parseBranchDiffStats(nameStatusOutput, numstatOutput);

    expect(stats.fileChanges).toEqual({ add: 0, m: 1, d: 0 });
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
  });

  it("returns zeroed stats for empty output", () => {
    const stats = parseBranchDiffStats("", "");
    expect(stats.fileChanges).toEqual({ add: 0, m: 0, d: 0 });
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
  });
});

describe("resolveDefaultBranch", () => {
  it("returns the stripped branch name when origin/HEAD resolves", async () => {
    mocks.runGit.mockImplementation((_cwd: string, args: string[]) => {
      if (args.join(" ") === "symbolic-ref --short refs/remotes/origin/HEAD") {
        return Promise.resolve("origin/main\n");
      }
      throw new Error(`unexpected args: ${args.join(" ")}`);
    });

    await expect(resolveDefaultBranch("/repo")).resolves.toBe("main");
  });

  it("falls back to refs/heads/main when origin/HEAD fails but main verifies", async () => {
    mocks.runGit.mockImplementation((_cwd: string, args: string[]) => {
      const command = args.join(" ");
      if (command === "symbolic-ref --short refs/remotes/origin/HEAD") {
        return Promise.reject(new Error("no upstream"));
      }
      if (command === "rev-parse --verify --quiet refs/heads/main") {
        return Promise.resolve("sha\n");
      }
      throw new Error(`unexpected args: ${command}`);
    });

    await expect(resolveDefaultBranch("/repo")).resolves.toBe("main");
  });

  it("falls back to refs/heads/master when main fails but master verifies", async () => {
    mocks.runGit.mockImplementation((_cwd: string, args: string[]) => {
      const command = args.join(" ");
      if (command === "symbolic-ref --short refs/remotes/origin/HEAD") {
        return Promise.reject(new Error("no upstream"));
      }
      if (command === "rev-parse --verify --quiet refs/heads/main") {
        return Promise.reject(new Error("no main"));
      }
      if (command === "rev-parse --verify --quiet refs/heads/master") {
        return Promise.resolve("sha\n");
      }
      throw new Error(`unexpected args: ${command}`);
    });

    await expect(resolveDefaultBranch("/repo")).resolves.toBe("master");
  });

  it("returns null when origin/HEAD, main, and master all fail", async () => {
    mocks.runGit.mockRejectedValue(new Error("fail"));

    await expect(resolveDefaultBranch("/repo")).resolves.toBeNull();
  });
});
