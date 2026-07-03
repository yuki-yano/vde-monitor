import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { defaultLaunchConfig } from "@/state/launch-agent-options";
import { ThemeProvider } from "@/state/theme-context";

import { SessionDetailProvider } from "./SessionDetailProvider";
import { SessionDetailView } from "./SessionDetailView";
import { createSessionDetail } from "./test-helpers";

// Provider<->View wiring smoke test (T15b #3).
//
// SessionDetailProvider.test.tsx exercises the real Provider but mocks
// SessionDetailView out of the picture (renderHook against the context
// directly), and SessionDetailView.test.tsx exercises the real View but
// mocks the whole SessionDetailProvider/context away. Neither test would
// catch a mismatch between what the Provider's context value actually
// contains and what the View (or the props/state hooks it composes)
// destructures from it. This test mounts the real Provider, the real View,
// and every real SessionDetail-internal hook/component in between, so a
// wiring break shows up as a render-time exception or a missing section
// here even though it's invisible to the other two suites.
//
// The only stubbed boundary is session-context's 7 context hooks (the
// equivalent of the server/SSE layer) via a module mock, following the
// exact pattern SessionDetailProvider.test.tsx already uses -- everything
// SessionDetail reads from the server flows through these injected
// `request*`/data callbacks, so mocking them also covers the "no real API
// fetch" boundary without needing MSW handlers. `token` is left `null` so
// the real (also unmocked) push-notifications and SSE-stream hooks take
// their "disabled" early-return path instead of touching `fetch`/
// `EventSource`.
const session = createSessionDetail({ paneId: "pane-1" });

const sessionContextValue = {
  token: null as string | null,
  apiBaseUrl: null as string | null,
  authError: null as string | null,
  sessions: [session],
  connected: true,
  connectionStatus: "healthy" as const,
  connectionIssue: null as string | null,
  highlightCorrections: { codex: true, claude: true },
  fileNavigatorConfig: { autoExpandMatchLimit: 100 },
  launchConfig: defaultLaunchConfig,
  getSessionDetail: (paneId: string) => (paneId === session.paneId ? session : null),
  reconnect: vi.fn(),
  refreshSessions: vi.fn(),
  requestScreen: vi.fn(async () => ({
    ok: true as const,
    paneId: session.paneId,
    mode: "text" as const,
    capturedAt: new Date(0).toISOString(),
    screen: "",
    full: true,
  })),
  requestStateTimeline: vi.fn(async () => ({
    paneId: session.paneId,
    now: new Date(0).toISOString(),
    range: "1h" as const,
    items: [],
    totalsMs: {},
    current: null,
  })),
  requestDiffSummary: vi.fn(async () => ({
    repoRoot: session.repoRoot,
    rev: "HEAD",
    generatedAt: new Date(0).toISOString(),
    files: [],
  })),
  requestDiffFile: vi.fn(),
  requestCommitLog: vi.fn(async () => ({
    repoRoot: session.repoRoot,
    rev: "HEAD",
    generatedAt: new Date(0).toISOString(),
    commits: [],
    totalCount: 0,
  })),
  requestCommitDetail: vi.fn(),
  requestCommitFile: vi.fn(),
  requestRepoNotes: vi.fn(async () => []),
  requestRepoFileTree: vi.fn(async () => ({ basePath: ".", entries: [] })),
  requestRepoFileSearch: vi.fn(),
  requestRepoFileContent: vi.fn(),
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
  resetSessionTitle: vi.fn(),
  requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
  requestBranches: vi.fn(async () => ({
    repoRoot: session.repoRoot,
    defaultBranch: "main",
    currentBranch: "main",
    entries: [],
  })),
  requestBranchCheckout: vi.fn(),
  requestBranchCreate: vi.fn(),
  requestBranchDelete: vi.fn(),
  createRepoNote: vi.fn(),
  updateRepoNote: vi.fn(),
  deleteRepoNote: vi.fn(),
};

vi.mock("@/state/session-context", () => ({
  useSessionStreamData: () => sessionContextValue,
  useSessionConfigData: () => sessionContextValue,
  useSessionCoreApi: () => sessionContextValue,
  useSessionBranchesApi: () => sessionContextValue,
  useSessionFilesApi: () => sessionContextValue,
  useSessionNotesApi: () => sessionContextValue,
  useSessionLaunchApi: () => sessionContextValue,
}));

const renderWithRouter = (ui: ReactNode) => {
  const rootRoute = createRootRoute({ component: () => null });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <RouterContextProvider router={router}>
      <ThemeProvider>{ui}</ThemeProvider>
    </RouterContextProvider>,
  );
};

describe("SessionDetail Provider <-> View wiring (smoke)", () => {
  it("mounts the real Provider + View + collector hooks and renders every primary section", async () => {
    const store = createStore();

    renderWithRouter(
      <JotaiProvider store={store}>
        <SessionDetailProvider paneId="pane-1">
          <SessionDetailView />
        </SessionDetailProvider>
      </JotaiProvider>,
    );

    expect(await screen.findByRole("button", { name: "Edit session title" })).toBeTruthy();
    expect(screen.getByText("State Timeline")).toBeTruthy();
    expect(screen.getByText("Changes")).toBeTruthy();
    expect(screen.getByText("File Navigator")).toBeTruthy();
    expect(screen.getByText("Commit Log")).toBeTruthy();
    expect(screen.getByText("Branches")).toBeTruthy();
    expect(screen.getByText("Worktrees")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
  });
});
