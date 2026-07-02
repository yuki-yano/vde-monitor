import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runGit: vi.fn(),
  resolveRepoRoot: vi.fn(),
}));

vi.mock("./git-utils", () => ({
  runGit: mocks.runGit,
  resolveRepoRoot: mocks.resolveRepoRoot,
}));

import { fetchCommitLog, parseCommitLogOutput, parseNameStatusOutput } from "./git-commits";

const RS = "\u001e";
const FS = "\u001f";

afterEach(() => {
  vi.clearAllMocks();
});

describe("parseCommitLogOutput", () => {
  it("parses commit log records", () => {
    const output = [
      `${RS}hash1${FS}h1${FS}Alice${FS}alice@example.com${FS}2024-01-01T00:00:00Z${FS}Subject one${FS}Body line 1\nBody line 2`,
      `${RS}hash2${FS}h2${FS}Bob${FS}${FS}2024-01-02T00:00:00Z${FS}Subject two${FS}`,
    ].join("");

    const commits = parseCommitLogOutput(output);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      hash: "hash1",
      shortHash: "h1",
      authorName: "Alice",
      authorEmail: "alice@example.com",
      subject: "Subject one",
    });
    expect(commits[0]?.body).toContain("Body line 2");
    expect(commits[1]).toMatchObject({
      hash: "hash2",
      shortHash: "h2",
      authorName: "Bob",
      authorEmail: null,
      subject: "Subject two",
      body: null,
    });
  });

  it("returns empty array for empty output", () => {
    expect(parseCommitLogOutput("")).toEqual([]);
  });
});

describe("parseNameStatusOutput", () => {
  it("parses name-status entries", () => {
    const output = ["M\tfile-a.txt", "R100\told.txt\tnew.txt", "A\tfile-b.txt"].join("\n");
    const files = parseNameStatusOutput(output);
    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({ status: "M", path: "file-a.txt" });
    expect(files[1]).toMatchObject({
      status: "R",
      path: "new.txt",
      renamedFrom: "old.txt",
    });
    expect(files[2]).toMatchObject({ status: "A", path: "file-b.txt" });
  });

  it("normalizes unknown status to ?", () => {
    const output = ["X\tweird.txt"].join("\n");
    const files = parseNameStatusOutput(output);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ status: "?", path: "weird.txt" });
  });
});

describe("fetchCommitLog", () => {
  it("appends base..branch to git log args when range is specified", async () => {
    mocks.resolveRepoRoot.mockResolvedValue("/repo");
    mocks.runGit.mockImplementation((_cwd: string, args: string[]) => {
      const command = args.join(" ");
      if (command === "rev-parse main") {
        return Promise.resolve("basesha\n");
      }
      if (command === "rev-parse feature") {
        return Promise.resolve("branchsha\n");
      }
      if (command === "rev-list --count main..feature") {
        return Promise.resolve("2\n");
      }
      if (
        command.startsWith("log -n 10 --skip 0 --date=iso-strict --format=") &&
        command.endsWith("main..feature")
      ) {
        return Promise.resolve(
          `${RS}hash1${FS}h1${FS}Alice${FS}alice@example.com${FS}2024-01-01T00:00:00Z${FS}Subject one${FS}`,
        );
      }
      throw new Error(`unexpected args: ${command}`);
    });

    const log = await fetchCommitLog("/repo", {
      range: { base: "main", branch: "feature" },
      force: true,
    });

    expect(mocks.runGit).toHaveBeenCalledWith("/repo", ["rev-parse", "main"]);
    expect(mocks.runGit).toHaveBeenCalledWith("/repo", ["rev-parse", "feature"]);
    expect(mocks.runGit).toHaveBeenCalledWith("/repo", ["rev-list", "--count", "main..feature"]);
    expect(mocks.runGit).toHaveBeenCalledWith(
      "/repo",
      expect.arrayContaining(["log", "main..feature"]),
    );
    expect(log.rev).toBe("basesha..branchsha");
    expect(log.totalCount).toBe(2);
    expect(log.commits).toHaveLength(1);
    expect(log.commits[0]).toMatchObject({ hash: "hash1", subject: "Subject one" });
  });
});
