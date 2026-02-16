// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectedAtom,
  currentSessionAtom,
  paneIdAtom,
  resolvedThemeAtom,
  sessionApiAtom,
} from "./atoms/sessionDetailAtoms";
import { SessionDetailProvider } from "./SessionDetailProvider";
import { createSessionDetail } from "./test-helpers";

const mockSession = createSessionDetail({ paneId: "pane-1" });
const nextMockSession = createSessionDetail({ paneId: "pane-2" });
const defaultMockSessionsContext = {
  sessions: [mockSession],
  connected: true,
  connectionStatus: "healthy" as "healthy" | "degraded" | "disconnected",
  connectionIssue: null as string | null,
  highlightCorrections: { codex: false, claude: true },
  fileNavigatorConfig: { autoExpandMatchLimit: 100 },
};
const mockSessionsContext = {
  ...defaultMockSessionsContext,
  reconnect: vi.fn(),
  refreshSessions: vi.fn(),
  requestDiffSummary: vi.fn(),
  requestDiffFile: vi.fn(),
  requestCommitLog: vi.fn(),
  requestCommitDetail: vi.fn(),
  requestCommitFile: vi.fn(),
  requestStateTimeline: vi.fn(),
  requestRepoNotes: vi.fn(),
  requestRepoFileTree: vi.fn(),
  requestRepoFileSearch: vi.fn(),
  requestRepoFileContent: vi.fn(),
  requestScreen: vi.fn(),
  focusPane: vi.fn(),
  killPane: vi.fn(),
  killWindow: vi.fn(),
  launchAgentInSession: vi.fn(),
  uploadImageAttachment: vi.fn(),
  sendText: vi.fn(),
  sendKeys: vi.fn(),
  sendRaw: vi.fn(),
  touchSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  createRepoNote: vi.fn(),
  updateRepoNote: vi.fn(),
  deleteRepoNote: vi.fn(),
  getSessionDetail: vi.fn(),
};
let mockResolvedTheme: "latte" | "mocha" = "mocha";

vi.mock("@/state/session-context", () => ({
  useSessions: () => mockSessionsContext,
}));

vi.mock("@/state/theme-context", () => ({
  useTheme: () => ({
    preference: "system",
    resolvedTheme: mockResolvedTheme,
    setPreference: vi.fn(),
  }),
}));

const TestConsumer = () => {
  const paneId = useAtomValue(paneIdAtom);
  const connected = useAtomValue(connectedAtom);
  const session = useAtomValue(currentSessionAtom);
  const theme = useAtomValue(resolvedThemeAtom);
  const api = useAtomValue(sessionApiAtom);

  return (
    <div>
      <div data-testid="pane-id">{paneId ?? ""}</div>
      <div data-testid="connected">{connected ? "true" : "false"}</div>
      <div data-testid="session-id">{session?.paneId ?? ""}</div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="api">{api ? "ready" : "missing"}</div>
    </div>
  );
};

describe("SessionDetailProvider", () => {
  beforeEach(() => {
    Object.assign(mockSessionsContext, {
      ...defaultMockSessionsContext,
      connectionStatus: "healthy",
      connectionIssue: null,
    });
    mockResolvedTheme = "mocha";
  });

  it("hydrates atoms from session context and theme", async () => {
    render(
      <SessionDetailProvider paneId="pane-1">
        <TestConsumer />
      </SessionDetailProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pane-id").textContent).toBe("pane-1");
    });
    expect(screen.getByTestId("connected").textContent).toBe("true");
    expect(screen.getByTestId("session-id").textContent).toBe("pane-1");
    expect(screen.getByTestId("theme").textContent).toBe("mocha");
    expect(screen.getByTestId("api").textContent).toBe("ready");
  });

  it("syncs atoms when pane and context values change", async () => {
    const { rerender } = render(
      <SessionDetailProvider paneId="pane-1">
        <TestConsumer />
      </SessionDetailProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pane-id").textContent).toBe("pane-1");
    });

    Object.assign(mockSessionsContext, {
      sessions: [nextMockSession],
      connected: false,
      connectionStatus: "disconnected",
      connectionIssue: "lost connection",
      highlightCorrections: { codex: true, claude: false },
      fileNavigatorConfig: { autoExpandMatchLimit: 42 },
    });
    mockResolvedTheme = "latte";

    rerender(
      <SessionDetailProvider paneId="pane-2">
        <TestConsumer />
      </SessionDetailProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pane-id").textContent).toBe("pane-2");
    });
    expect(screen.getByTestId("connected").textContent).toBe("false");
    expect(screen.getByTestId("session-id").textContent).toBe("pane-2");
    expect(screen.getByTestId("theme").textContent).toBe("latte");
    expect(screen.getByTestId("api").textContent).toBe("ready");
  });
});
