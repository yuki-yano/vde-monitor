import { render, screen } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { ChatGridBoard } from "./ChatGridBoard";

vi.mock("./ChatGridTile", () => ({
  ChatGridTile: ({
    session,
    onRemoveFromGrid,
  }: {
    session: { paneId: string };
    onRemoveFromGrid?: (paneId: string) => void;
  }) => (
    <div data-testid="chat-grid-tile">
      <span>{session.paneId}</span>
      <button type="button" onClick={() => onRemoveFromGrid?.(session.paneId)}>
        remove
      </button>
    </div>
  ),
}));

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "pane-1",
  sessionId: "session-id-1",
  sessionName: "session-1",
  windowId: "window-id-1",
  windowIndex: 1,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/Users/test/repo",
  paneTty: null,
  title: "Session Title",
  customTitle: null,
  branch: "main",
  worktreePath: "/Users/test/repo",
  worktreeDirty: false,
  worktreeLocked: false,
  worktreeLockOwner: null,
  worktreeLockReason: null,
  worktreeMerged: false,
  repoRoot: "/Users/test/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "ok",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: "2026-02-17T00:00:00.000Z",
  lastRunStartedAt: null,
  manualSortAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  completion: null,
  ...overrides,
});

describe("ChatGridBoard", () => {
  it("renders empty state when no sessions are selected", () => {
    render(
      <ChatGridBoard
        sessions={[]}
        isRestoringSelection={false}
        layout={{ columns: 2, rows: 1 }}
        nowMs={Date.now()}
        connected
        screenByPane={{}}
        screenLoadingByPane={{}}
        screenErrorByPane={{}}
        onTouchSession={vi.fn(async () => undefined)}
        onRemovePaneFromGrid={vi.fn()}
      />,
    );

    expect(screen.getByText("No Grid Applied")).toBeTruthy();
  });

  it("renders loading state while restoring pane selection", () => {
    render(
      <ChatGridBoard
        sessions={[]}
        isRestoringSelection
        layout={{ columns: 2, rows: 1 }}
        nowMs={Date.now()}
        connected
        screenByPane={{}}
        screenLoadingByPane={{}}
        screenErrorByPane={{}}
        onTouchSession={vi.fn(async () => undefined)}
        onRemovePaneFromGrid={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading Grid...")).toBeTruthy();
  });

  it("wires remove action for each tile", () => {
    const onRemovePaneFromGrid = vi.fn();
    render(
      <ChatGridBoard
        sessions={Array.from({ length: 5 }, (_, index) =>
          buildSession({ paneId: `pane-${index + 1}` }),
        )}
        isRestoringSelection={false}
        layout={{ columns: 3, rows: 2 }}
        nowMs={Date.now()}
        connected
        screenByPane={{}}
        screenLoadingByPane={{}}
        screenErrorByPane={{}}
        onTouchSession={vi.fn(async () => undefined)}
        onRemovePaneFromGrid={onRemovePaneFromGrid}
      />,
    );

    expect(screen.getAllByTestId("chat-grid-tile")).toHaveLength(5);
    screen.getAllByRole("button", { name: "remove" })[0]!.click();
    expect(onRemovePaneFromGrid).toHaveBeenCalledWith("pane-1");
  });
});
