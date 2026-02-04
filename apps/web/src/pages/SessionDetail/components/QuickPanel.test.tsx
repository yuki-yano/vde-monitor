// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSessionDetail } from "../test-helpers";
import { QuickPanel } from "./QuickPanel";

describe("QuickPanel", () => {
  type QuickPanelState = Parameters<typeof QuickPanel>[0]["state"];
  type QuickPanelActions = Parameters<typeof QuickPanel>[0]["actions"];

  const buildState = (overrides: Partial<QuickPanelState> = {}): QuickPanelState => ({
    open: true,
    sessionGroups: [],
    nowMs: Date.now(),
    ...overrides,
  });

  const buildActions = (overrides: Partial<QuickPanelActions> = {}): QuickPanelActions => ({
    onOpenLogModal: vi.fn(),
    onClose: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  });

  it("renders toggle button when closed", () => {
    const onToggle = vi.fn();
    const state = buildState({ open: false });
    const actions = buildActions({ onToggle });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Toggle session quick panel"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders empty state when no sessions", () => {
    const state = buildState({ open: true, sessionGroups: [] });
    const actions = buildActions();
    render(<QuickPanel state={state} actions={actions} />);

    expect(screen.getByText("No sessions available.")).toBeTruthy();
  });

  it("opens log modal for selected session", () => {
    const session = createSessionDetail();
    const onOpenLogModal = vi.fn();
    const state = buildState({
      open: true,
      sessionGroups: [
        {
          repoRoot: session.repoRoot,
          sessions: [session],
          lastInputAt: session.lastInputAt,
        },
      ],
    });
    const actions = buildActions({ onOpenLogModal });
    render(<QuickPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByText("Session Title"));
    expect(onOpenLogModal).toHaveBeenCalledWith("pane-1");
  });
});
