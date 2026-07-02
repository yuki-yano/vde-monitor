import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runGit: vi.fn(),
}));

vi.mock("./git-utils", () => ({
  runGit: mocks.runGit,
}));

vi.mock("./git-query-context", () => ({
  resolveGitRepoContext: vi.fn(async () => ({ repoRoot: "/repo" })),
  shouldReuseGitCache: () => false,
}));

vi.mock("./branch-pr-status", () => ({
  fetchBranchPrMap: vi.fn(async () => null),
}));

import {
  fetchBranchList,
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
  it("parses name, committedAt, HEAD marker, and sha", () => {
    const output = [
      "main\x002026-07-01T10:00:00+09:00\x00*\x00aaaa111",
      "feature/foo\x002026-06-30T09:00:00+09:00\x00 \x00bbbb222",
      "",
    ].join("\n");
    expect(parseForEachRefBranches(output)).toEqual([
      { name: "main", committedAt: "2026-07-01T10:00:00+09:00", current: true, sha: "aaaa111" },
      {
        name: "feature/foo",
        committedAt: "2026-06-30T09:00:00+09:00",
        current: false,
        sha: "bbbb222",
      },
    ]);
  });

  it("parses lines without a sha field as sha null", () => {
    const output = "main\x002026-07-01T10:00:00+09:00\x00*";
    expect(parseForEachRefBranches(output)).toEqual([
      { name: "main", committedAt: "2026-07-01T10:00:00+09:00", current: true, sha: null },
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

  it("compares committedAt by timestamp across timezone offsets", () => {
    // 2026-07-01T00:00:00+09:00 (= 2026-06-30T15:00:00Z) is older than
    // 2026-06-30T20:00:00-05:00 (= 2026-07-01T01:00:00Z) even though the
    // former is lexicographically larger.
    const sorted = sortBranchEntries([
      entry("jst", "2026-07-01T00:00:00+09:00"),
      entry("est", "2026-06-30T20:00:00-05:00"),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["est", "jst"]);
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

describe("fetchBranchList", () => {
  it("reuses sha-keyed stats and skips diff/rev-list git calls on refetch", async () => {
    const refsOutput = [
      "main\x002026-07-01T10:00:00+09:00\x00*\x00basesha1",
      "feature/foo\x002026-06-30T09:00:00+09:00\x00 \x00branchsha1",
    ].join("\n");
    mocks.runGit.mockImplementation((_cwd: string, args: string[]) => {
      const command = args.join(" ");
      if (args[0] === "for-each-ref") {
        return Promise.resolve(refsOutput);
      }
      if (args[0] === "worktree") {
        return Promise.resolve("");
      }
      if (command === "symbolic-ref --short refs/remotes/origin/HEAD") {
        return Promise.resolve("origin/main\n");
      }
      if (args[0] === "branch") {
        return Promise.resolve("  main\n");
      }
      if (args[0] === "rev-list") {
        return Promise.resolve("0\t2");
      }
      if (command.startsWith("diff --name-status")) {
        return Promise.resolve("A\tfile.ts");
      }
      if (args[0] === "diff") {
        return Promise.resolve("2\t0\tfile.ts");
      }
      throw new Error(`unexpected args: ${command}`);
    });

    const first = await fetchBranchList("/repo", { force: true });
    const second = await fetchBranchList("/repo", { force: true });

    const countCalls = (name: string) =>
      mocks.runGit.mock.calls.filter((call) => (call[1] as string[])[0] === name).length;
    expect(countCalls("for-each-ref")).toBe(2);
    expect(countCalls("rev-list")).toBe(1);
    expect(countCalls("diff")).toBe(2);

    const featureFirst = first.entries.find((entry) => entry.name === "feature/foo");
    const featureSecond = second.entries.find((entry) => entry.name === "feature/foo");
    expect(featureFirst?.ahead).toBe(2);
    expect(featureFirst?.fileChanges).toEqual({ add: 1, m: 0, d: 0 });
    expect(featureSecond).toEqual(featureFirst);
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
