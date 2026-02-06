// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createCommitDetail, createCommitFileDiff, createCommitLog } from "../test-helpers";
import { CommitSection } from "./CommitSection";

describe("CommitSection", () => {
  type CommitSectionState = Parameters<typeof CommitSection>[0]["state"];
  type CommitSectionActions = Parameters<typeof CommitSection>[0]["actions"];

  const buildState = (overrides: Partial<CommitSectionState> = {}): CommitSectionState => ({
    commitLog: null,
    commitError: null,
    commitLoading: false,
    commitLoadingMore: false,
    commitHasMore: false,
    commitDetails: {},
    commitFileDetails: {},
    commitFileOpen: {},
    commitFileLoading: {},
    commitOpen: {},
    commitLoadingDetails: {},
    copiedHash: null,
    ...overrides,
  });

  const buildActions = (overrides: Partial<CommitSectionActions> = {}): CommitSectionActions => ({
    onRefresh: vi.fn(),
    onLoadMore: vi.fn(),
    onToggleCommit: vi.fn(),
    onToggleCommitFile: vi.fn(),
    onCopyHash: vi.fn(),
    ...overrides,
  });

  it("renders commit log and handles copy", () => {
    const commitLog = createCommitLog();
    const onCopyHash = vi.fn();
    const state = buildState({ commitLog });
    const actions = buildActions({ onCopyHash });
    render(<CommitSection state={state} actions={actions} />);

    expect(screen.getByText("Initial commit")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Copy commit hash abc123"));
    expect(onCopyHash).toHaveBeenCalledWith("abc123");
  });

  it("handles commit and file toggles", () => {
    const commitLog = createCommitLog();
    const onToggleCommit = vi.fn();
    const onToggleCommitFile = vi.fn();
    const detail = createCommitDetail();
    const fileKey = "abc123:src/index.ts";
    const state = buildState({
      commitLog,
      commitDetails: { abc123: detail },
      commitFileDetails: { [fileKey]: createCommitFileDiff() },
      commitFileOpen: { [fileKey]: true },
      commitOpen: { abc123: true },
    });
    const actions = buildActions({ onToggleCommit, onToggleCommitFile });
    render(<CommitSection state={state} actions={actions} />);

    const commitToggle = screen.getByLabelText("Collapse commit");
    expect(commitToggle).toBeTruthy();
    expect(screen.getByText("Total changes")).toBeTruthy();
    fireEvent.click(screen.getByText("Initial commit"));
    expect(onToggleCommit).toHaveBeenCalledWith("abc123");

    fireEvent.click(screen.getByText("index.ts"));
    expect(onToggleCommitFile).toHaveBeenCalledWith("abc123", "src/index.ts");
  });

  it("renders load more button when available", () => {
    const commitLog = createCommitLog();
    const onLoadMore = vi.fn();
    const state = buildState({ commitLog, commitHasMore: true });
    const actions = buildActions({ onLoadMore });
    render(<CommitSection state={state} actions={actions} />);

    fireEvent.click(screen.getByText("Load more"));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("renders repository reason callout", () => {
    const commitLog = createCommitLog({ reason: "not_git" });
    const state = buildState({ commitLog });
    const actions = buildActions();
    render(<CommitSection state={state} actions={actions} />);

    expect(screen.getByText("Current directory is not a git repository.")).toBeTruthy();
  });

  it("shows missing detail message when expanded commit has no details", () => {
    const commitLog = createCommitLog();
    const state = buildState({
      commitLog,
      commitOpen: { abc123: true },
    });
    const actions = buildActions();
    render(<CommitSection state={state} actions={actions} />);

    expect(screen.getByText("No commit details.")).toBeTruthy();
  });
});
