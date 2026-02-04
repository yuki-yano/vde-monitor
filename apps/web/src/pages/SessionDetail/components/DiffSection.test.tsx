// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDiffFile, createDiffSummary } from "../test-helpers";
import { DiffSection } from "./DiffSection";

describe("DiffSection", () => {
  type DiffSectionState = Parameters<typeof DiffSection>[0]["state"];
  type DiffSectionActions = Parameters<typeof DiffSection>[0]["actions"];

  const buildState = (overrides: Partial<DiffSectionState> = {}): DiffSectionState => ({
    diffSummary: null,
    diffError: null,
    diffLoading: false,
    diffFiles: {},
    diffOpen: {},
    diffLoadingFiles: {},
    ...overrides,
  });

  const buildActions = (overrides: Partial<DiffSectionActions> = {}): DiffSectionActions => ({
    onRefresh: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  });

  it("renders diff summary and handles toggle", () => {
    const diffSummary = createDiffSummary();
    const onToggle = vi.fn();
    const state = buildState({ diffSummary });
    const actions = buildActions({ onToggle });
    render(<DiffSection state={state} actions={actions} />);

    expect(screen.getByText("Changes")).toBeTruthy();
    expect(screen.getByText("src/index.ts")).toBeTruthy();
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-0").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("src/index.ts"));
    expect(onToggle).toHaveBeenCalledWith("src/index.ts");
  });

  it("renders clean state and error message", () => {
    const state = buildState({
      diffSummary: createDiffSummary({ files: [] }),
      diffError: "Diff error",
    });
    const actions = buildActions();
    render(<DiffSection state={state} actions={actions} />);

    expect(screen.getByText("Working directory is clean")).toBeTruthy();
    expect(screen.getByText("+0")).toBeTruthy();
    expect(screen.getByText("-0")).toBeTruthy();
    expect(screen.getByText("Diff error")).toBeTruthy();
  });

  it("shows patch content when open", () => {
    const diffSummary = createDiffSummary();
    const diffFile = createDiffFile({ patch: "+hello\n-world" });
    const state = buildState({
      diffSummary,
      diffFiles: { "src/index.ts": diffFile },
      diffOpen: { "src/index.ts": true },
    });
    const actions = buildActions();
    render(<DiffSection state={state} actions={actions} />);

    expect(screen.getByText("+hello")).toBeTruthy();
    expect(screen.getByText("-world")).toBeTruthy();
  });
});
