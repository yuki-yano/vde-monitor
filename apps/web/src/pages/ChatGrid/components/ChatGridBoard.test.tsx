// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { ChatGridBoard } from "./ChatGridBoard";

vi.mock("./ChatGridTile", () => ({
  ChatGridTile: ({ session }: { session: { paneId: string } }) => (
    <div data-testid="chat-grid-tile">{session.paneId}</div>
  ),
}));

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "pane-1",
  sessionName: "session-1",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
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
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
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
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
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
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
      />,
    );

    expect(screen.getByText("Loading Grid...")).toBeTruthy();
  });

  it("applies 3x2 board classes and renders one tile per session", () => {
    const sessions = [
      buildSession({ paneId: "pane-1" }),
      buildSession({ paneId: "pane-2" }),
      buildSession({ paneId: "pane-3" }),
      buildSession({ paneId: "pane-4" }),
      buildSession({ paneId: "pane-5" }),
    ];
    const { container } = render(
      <ChatGridBoard
        sessions={sessions}
        isRestoringSelection={false}
        layout={{ columns: 3, rows: 2 }}
        nowMs={Date.now()}
        connected
        screenByPane={{}}
        screenLoadingByPane={{}}
        screenErrorByPane={{}}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
      />,
    );

    const grid = container.querySelector(".grid");
    expect(grid?.className).toContain("xl:grid-cols-3");
    expect(grid?.className).toContain("md:grid-rows-2");
    expect(screen.getAllByTestId("chat-grid-tile")).toHaveLength(5);
  });
});
