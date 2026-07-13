import { fireEvent, render, screen } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import type { ChatGridViewProps } from "./ChatGridView";
import { ChatGridView } from "./ChatGridView";

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/features/shared-session-ui/components/SessionSidebar", () => ({
  SessionSidebar: ({ actions }: { actions: { onTouchSession: (paneId: string) => void } }) => (
    <div data-testid="session-sidebar">
      <button type="button" onClick={() => actions.onTouchSession("pane-sidebar")}>
        sidebar-move-pane
      </button>
    </div>
  ),
}));

vi.mock("./components/ChatGridToolbar", () => ({
  ChatGridToolbar: ({ onOpenCandidateModal }: { onOpenCandidateModal: () => void }) => (
    <div data-testid="chat-grid-toolbar">
      <button type="button" onClick={onOpenCandidateModal}>
        open-candidates
      </button>
    </div>
  ),
}));

vi.mock("./components/ChatGridBoard", () => ({
  ChatGridBoard: ({
    sessions,
    onTouchSession,
  }: {
    sessions: SessionSummary[];
    onTouchSession: (paneId: string) => void;
  }) => (
    <div data-testid="chat-grid-board">
      <span data-testid="chat-grid-board-count">{sessions.length}</span>
      <button type="button" onClick={() => onTouchSession("pane-board")}>
        board-touch-pane
      </button>
    </div>
  ),
}));

vi.mock("./components/ChatGridCandidateModal", () => ({
  ChatGridCandidateModal: ({ open }: { open: boolean }) => (
    <div data-testid="chat-grid-modal">{open ? "open" : "closed"}</div>
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

const createProps = (overrides: Partial<ChatGridViewProps> = {}): ChatGridViewProps => ({
  nowMs: Date.parse("2026-02-17T00:10:00.000Z"),
  connected: true,
  connectionStatus: "healthy",
  connectionIssue: null,
  launchConfig: { agents: { codex: { options: [] }, claude: { options: [] } } },
  capabilities: { screenImage: true, launchAgent: true, resumeAgent: true },
  requestStateTimeline: vi.fn(async () => ({
    paneId: "pane-1",
    now: "2026-02-17T00:10:00.000Z",
    range: "1h" as const,
    items: [],
    totalsMs: {
      RUNNING: 0,
      DONE: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  })),
  requestScreen: vi.fn(async () => ({
    ok: true,
    paneId: "pane-1",
    mode: "text" as const,
    capturedAt: "2026-02-17T00:10:00.000Z",
    screen: "",
  })),
  requestWorktrees: vi.fn(async () => ({
    repoRoot: null,
    currentPath: null,
    entries: [],
  })),
  highlightCorrections: { codex: true, claude: true },
  resolvedTheme: "latte",
  sidebarSessionGroups: [],
  sidebarWidth: 320,
  selectedCount: 2,
  candidateModalOpen: false,
  candidateItems: [buildSession({ paneId: "pane-1" }), buildSession({ paneId: "pane-2" })],
  selectedCandidatePaneIds: ["pane-1", "pane-2"],
  selectedSessions: [buildSession({ paneId: "pane-1" }), buildSession({ paneId: "pane-2" })],
  isRestoringSelection: false,
  boardLayout: { columns: 2, rows: 1 },
  screenByPane: {},
  screenLoadingByPane: {},
  screenErrorByPane: {},
  onOpenCandidateModal: vi.fn(),
  onCloseCandidateModal: vi.fn(),
  onToggleCandidatePane: vi.fn(),
  onApplyCandidates: vi.fn(),
  onRefreshAllTiles: vi.fn(),
  onBackToSessionList: vi.fn(),
  onOpenPaneHere: vi.fn(),
  onRemovePaneFromGrid: vi.fn(),
  canSyncCandidateSelectionFromCurrentGrid: true,
  onSyncCandidateSelectionFromCurrentGrid: vi.fn(),
  onLaunchAgentInSession: vi.fn(async () => undefined),
  onTouchRepoPin: vi.fn(),
  onTouchPanePin: vi.fn(async () => undefined),
  onTouchSessionActivity: vi.fn(async () => undefined),
  onSidebarResizeStart: vi.fn(),
  ...overrides,
});

describe("ChatGridView", () => {
  it("renders selected sessions in board", () => {
    render(<ChatGridView {...createProps()} />);
    expect(screen.getByTestId("chat-grid-board-count").textContent).toBe("2");
    expect(screen.getByTestId("session-sidebar")).toBeTruthy();
  });

  it("renders connection issue and wires toolbar action", () => {
    const onOpenCandidateModal = vi.fn();
    const onBackToSessionList = vi.fn();
    render(
      <ChatGridView
        {...createProps({
          connectionIssue: "Disconnected. Reconnecting...",
          onOpenCandidateModal,
          onBackToSessionList,
        })}
      />,
    );

    expect(screen.getByText("Disconnected. Reconnecting...")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "open-candidates" }));
    expect(onOpenCandidateModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(onBackToSessionList).toHaveBeenCalledTimes(1);
  });

  it("keeps pane move and input activity callbacks separate", () => {
    const onTouchPanePin = vi.fn();
    const onTouchSessionActivity = vi.fn();
    render(<ChatGridView {...createProps({ onTouchPanePin, onTouchSessionActivity })} />);

    fireEvent.click(screen.getByRole("button", { name: "sidebar-move-pane" }));
    fireEvent.click(screen.getByRole("button", { name: "board-touch-pane" }));

    expect(onTouchPanePin).toHaveBeenCalledWith("pane-sidebar");
    expect(onTouchSessionActivity).toHaveBeenCalledWith("pane-board");
  });
});
