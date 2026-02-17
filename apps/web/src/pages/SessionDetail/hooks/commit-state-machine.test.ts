import { describe, expect, it } from "vitest";

import { initialCommitState } from "../atoms/commitAtoms";
import { createCommitDetail, createCommitFileDiff, createCommitLog } from "../test-helpers";
import { applyCommitLogState, commitReducer, mergeCommits } from "./commit-state-machine";

describe("commit-state-machine", () => {
  it("mergeCommits deduplicates hashes while keeping first occurrence order", () => {
    const baseCommit = createCommitLog().commits[0];
    if (!baseCommit) {
      throw new Error("base commit is required for this test");
    }
    const current = [baseCommit, { ...baseCommit, hash: "def456", shortHash: "def456" }];
    const incoming = [
      { ...baseCommit, hash: "def456", shortHash: "def456" },
      { ...baseCommit, hash: "ghi789", shortHash: "ghi789" },
    ];

    const merged = mergeCommits(current, incoming, true);

    expect(merged.map((commit) => commit.hash)).toEqual(["abc123", "def456", "ghi789"]);
  });

  it("applyCommitLogState prunes stale commit-scoped maps on replace", () => {
    const base = createCommitLog();
    const baseCommit = base.commits[0];
    if (!baseCommit) {
      throw new Error("base commit is required for this test");
    }
    const next = createCommitLog({
      commits: [{ ...baseCommit, hash: "new123", shortHash: "new123" }],
    });
    const state = {
      ...initialCommitState,
      commitLog: base,
      commitDetails: { abc123: createCommitDetail() },
      commitFileDetails: { "abc123:src/index.ts": createCommitFileDiff() },
      commitFileOpen: { "abc123:src/index.ts": true },
      commitFileLoading: { "abc123:src/index.ts": true },
      commitOpen: { abc123: true, new123: true },
    };

    const reduced = applyCommitLogState(state, {
      type: "applyCommitLog",
      log: next,
      append: false,
      pageSize: 10,
    });

    expect(reduced.commitLog?.commits.map((commit) => commit.hash)).toEqual(["new123"]);
    expect(reduced.commitDetails).toEqual({});
    expect(reduced.commitFileDetails).toEqual({});
    expect(reduced.commitFileOpen).toEqual({});
    expect(reduced.commitFileLoading).toEqual({});
    expect(reduced.commitOpen).toEqual({ new123: true });
  });

  it("commitReducer toggles loading flags by append mode", () => {
    const loading = commitReducer(initialCommitState, { type: "startLogLoad", append: false });
    const loadingMore = commitReducer(loading, { type: "startLogLoad", append: true });
    const finished = commitReducer(loadingMore, { type: "finishLogLoad", append: false });
    const finishedMore = commitReducer(finished, { type: "finishLogLoad", append: true });

    expect(loading.commitLoading).toBe(true);
    expect(loadingMore.commitLoadingMore).toBe(true);
    expect(finished.commitLoading).toBe(false);
    expect(finishedMore.commitLoadingMore).toBe(false);
  });

  it("commitReducer clears copied hash only when target matches", () => {
    const withCopied = commitReducer(initialCommitState, { type: "setCopiedHash", hash: "abc123" });
    const unchanged = commitReducer(withCopied, { type: "clearCopiedHash", hash: "zzz999" });
    const cleared = commitReducer(withCopied, { type: "clearCopiedHash", hash: "abc123" });

    expect(unchanged.copiedHash).toBe("abc123");
    expect(cleared.copiedHash).toBeNull();
  });
});
