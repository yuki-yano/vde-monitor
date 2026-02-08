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
const mockUseSessionLogs = vi.hoisted(() => ({
  quickPanelOpen: false,
  logModalOpen: false,
  selectedPaneId: null,
  selectedSession: null,
  selectedLogLines: [],
  selectedLogLoading: false,
  selectedLogError: null,
  openLogModal: vi.fn(),
  closeLogModal: vi.fn(),
  toggleQuickPanel: vi.fn(),
  closeQuickPanel: vi.fn(),
}));

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
      <button type="button" onClick={() => vm.onTogglePanePin("pane-test")}>
        touch-pane
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
    mockUseSessions.mockReturnValue({
      sessions: [],
      connected: true,
      connectionStatus: "healthy",
      connectionIssue: null,
      refreshSessions: vi.fn(),
      requestScreen: vi.fn(),
      touchSession: vi.fn(),
      highlightCorrections: false,
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
      requestScreen: vi.fn(),
      touchSession,
      highlightCorrections: false,
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
});
