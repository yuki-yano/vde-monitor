// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SESSION_LIST_FILTER, isSessionListFilter } from "./sessionListFilters";
import { useSessionListVM } from "./useSessionListVM";

const STORAGE_KEY = "vde-monitor-session-list-pins";

const mockUseSessions = vi.hoisted(() => vi.fn());
const mockUseSessionLogs = vi.hoisted(
  () =>
    ({
      quickPanelOpen: false,
      logModalOpen: false,
      selectedPaneId: null as string | null,
      selectedSession: null as SessionSummary | null,
      selectedLogLines: [] as string[],
      selectedLogLoading: false,
      selectedLogError: null as string | null,
      openLogModal: vi.fn<(paneId: string) => void>(),
      closeLogModal: vi.fn<() => void>(),
      toggleQuickPanel: vi.fn<() => void>(),
      closeQuickPanel: vi.fn<() => void>(),
    }) satisfies {
      quickPanelOpen: boolean;
      logModalOpen: boolean;
      selectedPaneId: string | null;
      selectedSession: SessionSummary | null;
      selectedLogLines: string[];
      selectedLogLoading: boolean;
      selectedLogError: string | null;
      openLogModal: (paneId: string) => void;
      closeLogModal: () => void;
      toggleQuickPanel: () => void;
      closeQuickPanel: () => void;
    },
);

vi.mock("@/state/session-context", () => ({
  useSessions: () => mockUseSessions(),
}));

vi.mock("@/state/theme-context", () => ({
  useTheme: () => ({ resolvedTheme: "latte" }),
}));

vi.mock("@/lib/use-now-ms", () => ({
  useNowMs: () => 0,
}));

vi.mock("@/lib/use-sidebar-width", () => ({
  useSidebarWidth: () => ({
    sidebarWidth: 280,
    handlePointerDown: vi.fn(),
  }),
}));

vi.mock("../SessionDetail/hooks/useSessionLogs", () => ({
  useSessionLogs: () => mockUseSessionLogs,
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
  repoRoot: "/Users/test/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "ok",
  lastMessage: "Hello",
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: new Date(0).toISOString(),
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

const createTestRouter = (initialEntries: string[]) => {
  const rootRoute = createRootRoute({
    component: () => null,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
    validateSearch: (search: Record<string, unknown>) => {
      const filter = isSessionListFilter(search.filter)
        ? search.filter
        : DEFAULT_SESSION_LIST_FILTER;
      return { filter };
    },
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries }),
  });
};

const TestComponent = () => {
  const vm = useSessionListVM();
  return (
    <div>
      <span data-testid="filter">{vm.filter}</span>
      <button type="button" onClick={() => vm.onFilterChange("SHELL")}>
        set-shell
      </button>
      <button type="button" onClick={() => vm.onFilterChange("UNKNOWN")}>
        set-unknown
      </button>
      <button type="button" onClick={() => vm.onFilterChange("EDITOR")}>
        set-editor
      </button>
      <button type="button" onClick={() => vm.onFilterChange("invalid")}>
        set-invalid
      </button>
      <button type="button" onClick={() => vm.onTouchPanePin("pane-test")}>
        touch-pane
      </button>
      <button type="button" onClick={vm.onOpenNewTab}>
        open-new-tab
      </button>
    </div>
  );
};

const renderWithRouter = async (initialEntries: string[] = ["/"]) => {
  const router = createTestRouter(initialEntries);
  await act(async () => {
    await router.load();
  });
  return render(
    <RouterContextProvider router={router}>
      <TestComponent />
    </RouterContextProvider>,
  );
};

describe("useSessionListVM", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUseSessionLogs.quickPanelOpen = false;
    mockUseSessionLogs.logModalOpen = false;
    mockUseSessionLogs.selectedPaneId = null;
    mockUseSessionLogs.selectedSession = null;
    mockUseSessionLogs.selectedLogLines = [];
    mockUseSessionLogs.selectedLogLoading = false;
    mockUseSessionLogs.selectedLogError = null;
    mockUseSessionLogs.openLogModal = vi.fn();
    mockUseSessionLogs.closeLogModal = vi.fn();
    mockUseSessionLogs.toggleQuickPanel = vi.fn();
    mockUseSessionLogs.closeQuickPanel = vi.fn();
    mockUseSessions.mockReturnValue({
      sessions: [],
      connected: true,
      connectionStatus: "healthy",
      connectionIssue: null,
      refreshSessions: vi.fn(),
      requestStateTimeline: vi.fn(),
      requestScreen: vi.fn(),
      touchSession: vi.fn(),
      highlightCorrections: { codex: true, claude: true },
    });
  });

  it("reads filter from search params", async () => {
    await renderWithRouter(["/?filter=SHELL"]);
    expect(screen.getByTestId("filter").textContent).toBe("SHELL");
  });

  it("defaults to AGENT when search is missing", async () => {
    await renderWithRouter(["/"]);
    expect(screen.getByTestId("filter").textContent).toBe("AGENT");
  });

  it("updates filter when onFilterChange is called", async () => {
    await renderWithRouter(["/?filter=AGENT"]);
    fireEvent.click(screen.getByRole("button", { name: "set-unknown" }));
    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("UNKNOWN");
    });
  });

  it("accepts EDITOR filter value", async () => {
    await renderWithRouter(["/?filter=AGENT"]);
    fireEvent.click(screen.getByRole("button", { name: "set-editor" }));
    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("EDITOR");
    });
  });

  it("falls back to default for invalid filter values", async () => {
    await renderWithRouter(["/?filter=SHELL"]);
    fireEvent.click(screen.getByRole("button", { name: "set-invalid" }));
    await waitFor(() => {
      expect(screen.getByTestId("filter").textContent).toBe("AGENT");
    });
  });

  it("uses touchSession for pane pin action", async () => {
    const touchSession = vi.fn().mockResolvedValue(undefined);
    const pinnedSession = buildSession({
      paneId: "pane-test",
      repoRoot: "/Users/test/repo-pin-target",
    });
    mockUseSessions.mockReturnValue({
      sessions: [pinnedSession],
      connected: true,
      connectionStatus: "healthy",
      connectionIssue: null,
      refreshSessions: vi.fn(),
      requestStateTimeline: vi.fn(),
      requestScreen: vi.fn(),
      touchSession,
      highlightCorrections: { codex: true, claude: true },
    });

    await renderWithRouter(["/"]);
    fireEvent.click(screen.getByRole("button", { name: "touch-pane" }));

    await waitFor(() => {
      expect(touchSession).toHaveBeenCalledWith("pane-test");
    });

    await waitFor(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored ?? "{}") as { repos?: Record<string, number> };
      expect(parsed.repos?.["repo:/Users/test/repo-pin-target"]).toBeTypeOf("number");
    });
  });

  it("closes quick panel and log modal before opening selected pane in new tab", async () => {
    const closeQuickPanel = vi.fn();
    const closeLogModal = vi.fn();
    mockUseSessionLogs.selectedPaneId = "pane target/1";
    mockUseSessionLogs.closeQuickPanel = closeQuickPanel;
    mockUseSessionLogs.closeLogModal = closeLogModal;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    await renderWithRouter(["/"]);
    fireEvent.click(screen.getByRole("button", { name: "open-new-tab" }));

    expect(closeQuickPanel).toHaveBeenCalledTimes(1);
    expect(closeLogModal).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "/sessions/pane%20target%2F1",
      "_blank",
      "noopener,noreferrer",
    );
    const openOrder = openSpy.mock.invocationCallOrder[0];
    const closeQuickOrder = closeQuickPanel.mock.invocationCallOrder[0];
    const closeLogOrder = closeLogModal.mock.invocationCallOrder[0];
    expect(openOrder).toBeDefined();
    expect(closeQuickOrder).toBeDefined();
    expect(closeLogOrder).toBeDefined();
    if (openOrder == null || closeQuickOrder == null || closeLogOrder == null) {
      throw new Error("missing invocation order");
    }
    expect(closeQuickOrder).toBeLessThan(openOrder);
    expect(closeLogOrder).toBeLessThan(openOrder);
    openSpy.mockRestore();
  });
});
