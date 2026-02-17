// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createCommitDetail, createCommitFileDiff, createCommitLog } from "../test-helpers";
import { CommitSection } from "./CommitSection";

describe("CommitSection", () => {
  type CommitSectionState = Parameters<typeof CommitSection>[0]["state"];
  type CommitSectionActions = Parameters<typeof CommitSection>[0]["actions"];

  const buildState = (overrides: Partial<CommitSectionState> = {}): CommitSectionState => ({
    commitLog: null,
    commitBranch: null,
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

    const commitToggle = screen.getByRole("button", { name: "Collapse commit abc123" });
    expect(commitToggle).toBeTruthy();
    expect(screen.getByText("Total changes")).toBeTruthy();
    fireEvent.click(screen.getByText("Initial commit"));
    expect(onToggleCommit).toHaveBeenCalledWith("abc123");
    fireEvent.keyDown(commitToggle, { key: "Enter" });
    expect(onToggleCommit).toHaveBeenCalledWith("abc123");

    const fileToggle = screen.getByRole("button", { name: "Collapse file diff src/index.ts" });
    fireEvent.click(fileToggle);
    expect(onToggleCommitFile).toHaveBeenCalledWith("abc123", "src/index.ts");
    fireEvent.keyDown(fileToggle, { key: " " });
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

  it("shows branch name next to commit count", () => {
    const commitLog = createCommitLog();
    const state = buildState({ commitLog, commitBranch: "feature/commit-tab" });
    const actions = buildActions();
    render(<CommitSection state={state} actions={actions} />);

    expect(screen.getByText("feature/commit-tab")).toBeTruthy();
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

  it("resolves file reference links rendered in commit diff", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async () => ["src/index.ts:10"]);
    const fileKey = "abc123:src/index.ts";
    const state = buildState({
      commitLog: createCommitLog(),
      commitDetails: { abc123: createCommitDetail() },
      commitFileDetails: { [fileKey]: createCommitFileDiff({ patch: "+at src/index.ts:10" }) },
      commitFileOpen: { [fileKey]: true },
      commitOpen: { abc123: true },
    });
    const actions = buildActions({
      onResolveFileReference,
      onResolveFileReferenceCandidates,
    });
    render(<CommitSection state={state} actions={actions} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open file src/index.ts:10" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open file src/index.ts:10" }));

    expect(onResolveFileReferenceCandidates).toHaveBeenCalledWith(
      expect.arrayContaining(["src/index.ts:10"]),
    );
    expect(onResolveFileReference).toHaveBeenCalledWith("src/index.ts:10");
  });
});
