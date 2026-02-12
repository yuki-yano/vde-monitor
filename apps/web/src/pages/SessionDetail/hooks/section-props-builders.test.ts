import { describe, expect, it, vi } from "vitest";

import {
  buildCommitSectionProps,
  buildDiffSectionProps,
  buildStateTimelineSectionProps,
} from "./section-props-builders";

describe("section props builders", () => {
  it("builds diff section props with state and action passthrough", () => {
    const refreshDiff = vi.fn();
    const toggleDiff = vi.fn();
    const diffFiles = {
      "a.ts": {
        path: "a.ts",
        status: "M" as const,
        patch: "@@ -1,1 +1,1 @@",
        binary: false,
        rev: "HEAD",
      },
    };

    const props = buildDiffSectionProps({
      diffSummary: {
        repoRoot: "/repo",
        rev: "HEAD",
        generatedAt: new Date(0).toISOString(),
        files: [],
      },
      diffError: null,
      diffLoading: false,
      diffFiles,
      diffOpen: { "a.ts": true },
      diffLoadingFiles: {},
      refreshDiff,
      toggleDiff,
    });

    expect(props.state.diffFiles).toBe(diffFiles);
    expect(props.actions.onRefresh).toBe(refreshDiff);
    expect(props.actions.onToggle).toBe(toggleDiff);
  });

  it("builds timeline section props with renamed action keys", () => {
    const setTimelineRange = vi.fn();
    const refreshTimeline = vi.fn();
    const toggleTimelineExpanded = vi.fn();

    const props = buildStateTimelineSectionProps({
      stateTimeline: {
        paneId: "%1",
        now: new Date(0).toISOString(),
        range: "1h",
        items: [],
        totalsMs: {
          RUNNING: 0,
          WAITING_INPUT: 0,
          WAITING_PERMISSION: 0,
          SHELL: 0,
          UNKNOWN: 0,
        },
        current: null,
      },
      timelineRange: "1h",
      timelineError: null,
      timelineLoading: true,
      timelineExpanded: false,
      isMobile: true,
      setTimelineRange,
      refreshTimeline,
      toggleTimelineExpanded,
    });

    expect(props.state.timelineRange).toBe("1h");
    expect(props.actions.onTimelineRangeChange).toBe(setTimelineRange);
    expect(props.actions.onTimelineRefresh).toBe(refreshTimeline);
    expect(props.actions.onToggleTimelineExpanded).toBe(toggleTimelineExpanded);
  });

  it("builds commit section props with full action mapping", () => {
    const refreshCommitLog = vi.fn();
    const loadMoreCommits = vi.fn();
    const toggleCommit = vi.fn();
    const toggleCommitFile = vi.fn();
    const copyHash = vi.fn();

    const props = buildCommitSectionProps({
      commitLog: {
        repoRoot: "/repo",
        rev: "HEAD",
        generatedAt: new Date(0).toISOString(),
        commits: [],
      },
      commitError: null,
      commitLoading: false,
      commitLoadingMore: false,
      commitHasMore: true,
      commitDetails: {},
      commitFileDetails: {},
      commitFileOpen: {},
      commitFileLoading: {},
      commitOpen: {},
      commitLoadingDetails: {},
      copiedHash: null,
      refreshCommitLog,
      loadMoreCommits,
      toggleCommit,
      toggleCommitFile,
      copyHash,
    });

    expect(props.state.commitHasMore).toBe(true);
    expect(props.actions.onRefresh).toBe(refreshCommitLog);
    expect(props.actions.onLoadMore).toBe(loadMoreCommits);
    expect(props.actions.onToggleCommit).toBe(toggleCommit);
    expect(props.actions.onToggleCommitFile).toBe(toggleCommitFile);
    expect(props.actions.onCopyHash).toBe(copyHash);
  });
});
