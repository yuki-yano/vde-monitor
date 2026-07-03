import { act, renderHook, screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { defaultLaunchConfig } from "@/state/launch-agent-options";

import { NotesSection } from "./components/NotesSection";
import { useSessionDetailViewDataSectionProps } from "./hooks/useSessionDetailViewDataSectionProps";
import { useSessionDetailVMState } from "./hooks/useSessionDetailVMState";
import { SessionDetailProvider, useSessionDetailContext } from "./SessionDetailProvider";
import { createSessionDetail } from "./test-helpers";

const session = createSessionDetail({ paneId: "pane-1" });
const sessionGroups = [{ repoRoot: null, sessions: [session] }];
const setScreenErrorMock = vi.fn();
let mockResolvedTheme: "latte" | "mocha" = "mocha";
let mockSessionsContext: Record<string, unknown> = {};

// Mirrors use-session-store.ts's real toSessionDetail cache: the same
// underlying session object reference must resolve to the same "detail" view
// reference across repeated getSessionDetail calls. Without this, `.find()`
// alone happens to already return a stable reference (since it's just an
// array lookup), which would make it impossible for this mock to ever
// exhibit -- or guard against -- the "getSessionDetail returns a fresh
// object on every call" bug that real production has without its own cache.
const sessionDetailViewCache = new WeakMap<typeof session, typeof session>();
const toMockSessionDetail = (source: typeof session) => {
  const cached = sessionDetailViewCache.get(source);
  if (cached) {
    return cached;
  }
  const detail = { ...source };
  sessionDetailViewCache.set(source, detail);
  return detail;
};

const buildSessionContext = ({
  sessions,
  sessionApi,
  connected = true,
  connectionIssue = null,
}: {
  sessions: Array<typeof session>;
  sessionApi: Record<string, unknown>;
  connected?: boolean;
  connectionIssue?: string | null;
}) => ({
  token: "token",
  sessions,
  connected,
  connectionStatus: connected ? "healthy" : "degraded",
  connectionIssue,
  highlightCorrections: { codex: false, claude: true },
  fileNavigatorConfig: { autoExpandMatchLimit: 100 },
  launchConfig: defaultLaunchConfig,
  ...sessionApi,
  getSessionDetail: (paneId: string) => {
    const found = sessions.find((item) => item.paneId === paneId) ?? null;
    return found ? toMockSessionDetail(found) : null;
  },
});

const buildSessionApi = (overrides: Record<string, unknown> = {}) => ({
  reconnect: vi.fn(),
  refreshSessions: vi.fn(),
  requestDiffSummary: vi.fn(),
  requestDiffFile: vi.fn(),
  requestCommitLog: vi.fn(),
  requestCommitDetail: vi.fn(),
  requestCommitFile: vi.fn(),
  requestStateTimeline: vi.fn(),
  requestRepoNotes: vi.fn(),
  requestRepoFileTree: vi.fn(async () => ({ basePath: ".", entries: [] })),
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
  resetSessionTitle: vi.fn(),
  requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
  requestBranches: vi.fn(async () => ({
    repoRoot: "/repo",
    defaultBranch: "main",
    currentBranch: "main",
    entries: [],
  })),
  requestBranchCheckout: vi.fn(async () => undefined),
  requestBranchCreate: vi.fn(async () => undefined),
  requestBranchDelete: vi.fn(async () => undefined),
  createRepoNote: vi.fn(),
  updateRepoNote: vi.fn(),
  deleteRepoNote: vi.fn(),
  ...overrides,
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/state/session-context", () => ({
  useSessionStreamData: () => mockSessionsContext,
  useSessionConfigData: () => mockSessionsContext,
  useSessionCoreApi: () => mockSessionsContext,
  useSessionBranchesApi: () => mockSessionsContext,
  useSessionFilesApi: () => mockSessionsContext,
  useSessionNotesApi: () => mockSessionsContext,
  useSessionLaunchApi: () => mockSessionsContext,
}));

vi.mock("@/state/theme-context", () => ({
  useTheme: () => ({
    preference: "system",
    resolvedTheme: mockResolvedTheme,
    setPreference: vi.fn(),
  }),
}));

vi.mock("@/features/notifications/use-push-notifications", () => ({
  usePushNotifications: () => ({
    status: "idle",
    pushEnabled: true,
    isSubscribed: false,
    isPaneEnabled: false,
    errorMessage: null,
    requestPermissionAndSubscribe: vi.fn(async () => undefined),
    disableNotifications: vi.fn(async () => undefined),
    togglePaneEnabled: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/session-group", () => ({
  buildSessionGroups: vi.fn(() => sessionGroups),
}));

vi.mock("./hooks/useSessionScreen", () => ({
  useSessionScreen: () => ({
    mode: "text",
    wrapMode: "off",
    screenLines: ["line"],
    imageBase64: null,
    fallbackReason: null,
    error: null,
    pollingPauseReason: null,
    setScreenError: setScreenErrorMock,
    isScreenLoading: false,
    isAtBottom: true,
    handleAtBottomChange: vi.fn(),
    handleUserScrollStateChange: vi.fn(),
    forceFollow: false,
    refreshScreen: vi.fn(),
    scrollToBottom: vi.fn(),
    handleModeChange: vi.fn(),
    toggleWrapMode: vi.fn(),
    virtuosoRef: { current: null },
    scrollerRef: { current: null },
  }),
}));

// Counts how many times NotesSection's own function body actually executes
// (as opposed to how many times its parent re-renders). useNotesPolling is
// called unconditionally at the top of NotesSection, so replacing it with a
// counting stub gives a reliable signal for "did NotesSection's memo bail?"
// without relying on ambiguous Profiler semantics.
let notesPollingCallCount = 0;
vi.mock("./hooks/useNotesPolling", () => ({
  useNotesPolling: () => {
    notesPollingCallCount += 1;
  },
}));

vi.mock("./hooks/useSessionControls", () => ({
  useSessionControls: () => ({
    textInputRef: { current: null },
    autoEnter: true,
    shiftHeld: false,
    ctrlHeld: false,
    rawMode: false,
    allowDangerKeys: false,
    isSendingText: false,
    handleSendKey: vi.fn(),
    handleSendPermissionShortcut: vi.fn(),
    handleKillPane: vi.fn(),
    handleKillWindow: vi.fn(),
    handleSendText: vi.fn(),
    handleUploadImage: vi.fn(),
    handleRawBeforeInput: vi.fn(),
    handleRawInput: vi.fn(),
    handleRawKeyDown: vi.fn(),
    handleRawCompositionStart: vi.fn(),
    handleRawCompositionEnd: vi.fn(),
    toggleAutoEnter: vi.fn(),
    toggleShift: vi.fn(),
    toggleCtrl: vi.fn(),
    toggleRawMode: vi.fn(),
    toggleAllowDangerKeys: vi.fn(),
  }),
}));

// Renders NotesSection through the real collector hook
// (useSessionDetailViewDataSectionProps) exactly the way SessionDetailView
// does, so the memo-effectiveness of the real props chain is exercised.
const NotesProbe = () => {
  const { notesSectionProps } = useSessionDetailViewDataSectionProps({ isMobile: false });
  return <NotesSection {...notesSectionProps} />;
};

const renderContext = (
  sessions: Array<typeof session>,
  sessionApi: Record<string, unknown>,
  options: { connectionIssue?: string | null } = {},
) => {
  const store = createStore();
  mockSessionsContext = buildSessionContext({
    sessions,
    sessionApi,
    connectionIssue: options.connectionIssue ?? null,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <SessionDetailProvider paneId="pane-1">{children}</SessionDetailProvider>
    </JotaiProvider>
  );
  return renderHook(() => useSessionDetailContext(), { wrapper });
};

describe("SessionDetailProvider", () => {
  it("renders children", () => {
    mockSessionsContext = buildSessionContext({
      sessions: [session],
      sessionApi: buildSessionApi(),
    });
    render(
      <SessionDetailProvider paneId="pane-1">
        <div data-testid="child">child</div>
      </SessionDetailProvider>,
    );

    expect(screen.getByTestId("child").textContent).toBe("child");
  });

  it("exposes base state via context", () => {
    mockResolvedTheme = "mocha";
    const { result } = renderContext([session], buildSessionApi(), { connectionIssue: "issue" });

    expect(result.current.base.paneId).toBe("pane-1");
    expect(result.current.base.connected).toBe(true);
    expect(result.current.base.connectionIssue).toBe("issue");
    expect(result.current.base.session?.paneId).toBe("pane-1");
    expect(result.current.repoPins.sessionGroups).toBe(sessionGroups);
  });

  it("sets screen error when focus pane command fails", async () => {
    setScreenErrorMock.mockClear();
    const focusPane = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMIT", message: "rate limited" },
    });
    const { result } = renderContext([session], buildSessionApi({ focusPane }));

    await act(async () => {
      await result.current.timelineLogsActions.actions.handleFocusPane("pane-1");
    });

    expect(focusPane).toHaveBeenCalledWith("pane-1");
    expect(setScreenErrorMock).toHaveBeenCalledWith("rate limited");
  });

  it("touches target pane when sidebar pin action is triggered", () => {
    const touchSession = vi.fn().mockResolvedValue(undefined);
    const { result } = renderContext(
      [session],
      buildSessionApi({ touchSession, focusPane: vi.fn().mockResolvedValue({ ok: true }) }),
    );

    act(() => {
      result.current.timelineLogsActions.actions.handleTouchPaneWithRepoAnchor("pane-2");
    });

    expect(touchSession).toHaveBeenCalledWith("pane-2");
  });

  it("keeps virtual branch and virtual worktree selection mutually exclusive", async () => {
    window.localStorage.clear();
    const sessionApi = buildSessionApi({
      requestWorktrees: vi.fn(async () => ({
        repoRoot: session.repoRoot,
        currentPath: null,
        baseBranch: "main",
        entries: [
          {
            path: "/Users/test/repo-worktrees/wt-a",
            branch: "feature/wt-a",
            dirty: false,
            locked: false,
            lockOwner: null,
            lockReason: null,
            merged: false,
          },
        ],
      })),
      requestBranches: vi.fn(async () => ({
        repoRoot: session.repoRoot,
        defaultBranch: "main",
        currentBranch: "main",
        entries: [
          {
            name: "main",
            current: true,
            isDefault: true,
            ahead: null,
            behind: null,
            fileChanges: null,
            additions: null,
            deletions: null,
            merged: null,
            pr: null,
            worktreePath: null,
            committedAt: null,
          },
          {
            name: "feature/a",
            current: false,
            isDefault: false,
            ahead: null,
            behind: null,
            fileChanges: null,
            additions: null,
            deletions: null,
            merged: null,
            pr: null,
            worktreePath: null,
            committedAt: null,
          },
        ],
      })),
    });
    const { result } = renderContext([session], sessionApi);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.scope.selectVirtualWorktree("/Users/test/repo-worktrees/wt-a");
    });

    expect(result.current.scope.virtualWorktree.virtualWorktreePath).toBe(
      "/Users/test/repo-worktrees/wt-a",
    );
    expect(result.current.scope.virtualBranch.virtualBranch).toBeNull();

    act(() => {
      result.current.scope.selectVirtualBranch("feature/a");
    });

    expect(result.current.scope.virtualBranch.virtualBranch).toBe("feature/a");
    expect(result.current.scope.virtualWorktree.virtualWorktreePath).toBeNull();

    act(() => {
      result.current.scope.selectVirtualWorktree("/Users/test/repo-worktrees/wt-a");
    });

    expect(result.current.scope.virtualWorktree.virtualWorktreePath).toBe(
      "/Users/test/repo-worktrees/wt-a",
    );
    expect(result.current.scope.virtualBranch.virtualBranch).toBeNull();
  });

  it("refreshes diff and commit log after a successful branch checkout", async () => {
    window.localStorage.clear();
    const requestBranchCheckout = vi.fn(async () => undefined);
    const requestWorktrees = vi.fn(async () => ({
      repoRoot: null,
      currentPath: null,
      entries: [],
    }));
    const requestDiffSummary = vi.fn(async () => ({
      repoRoot: "/repo",
      rev: "HEAD",
      generatedAt: new Date(0).toISOString(),
      files: [],
    }));
    const requestCommitLog = vi.fn(async () => ({
      repoRoot: "/repo",
      rev: "HEAD",
      generatedAt: new Date(0).toISOString(),
      commits: [],
      totalCount: 0,
    }));
    const sessionApi = buildSessionApi({
      requestBranchCheckout,
      requestWorktrees,
      requestDiffSummary,
      requestCommitLog,
      requestBranches: vi.fn(async () => ({
        repoRoot: session.repoRoot,
        defaultBranch: "main",
        currentBranch: "main",
        entries: [],
      })),
    });
    const { result } = renderContext([session], sessionApi);

    await act(async () => {
      await Promise.resolve();
    });

    const worktreeCallsBeforeCheckout = requestWorktrees.mock.calls.length;
    const diffCallsBeforeCheckout = requestDiffSummary.mock.calls.length;
    const commitCallsBeforeCheckout = requestCommitLog.mock.calls.length;

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.scope.checkoutBranch("feature/a");
    });

    expect(ok).toBe(true);
    expect(requestBranchCheckout).toHaveBeenCalledWith("pane-1", "feature/a");
    expect(requestDiffSummary.mock.calls.length).toBeGreaterThan(diffCallsBeforeCheckout);
    expect(requestCommitLog.mock.calls.length).toBeGreaterThan(commitCallsBeforeCheckout);
    expect(requestWorktrees.mock.calls.length).toBeGreaterThan(worktreeCallsBeforeCheckout);
  });

  // Render-suppression regression coverage for T15a. useSessionDetailVMState's
  // return value ("base") used to be a plain object literal (never
  // memoized), so it produced a new reference on every render for any reason
  // at all -- which made SessionDetailProvider's final context-value useMemo
  // (whose deps include `base`) cache-miss unconditionally, forcing every
  // SessionDetailContext consumer (View + 5 props/state hooks) to re-run on
  // every SSE tick. This checks useSessionDetailVMState's own output
  // directly (rather than the Provider's combined context value, which also
  // depends on several other subhooks outside this task's scope and so is
  // not usable as a stability signal for `base` specifically).
  it("keeps the useSessionDetailVMState return reference stable across a re-render where nothing changed (T15a)", () => {
    mockSessionsContext = buildSessionContext({
      sessions: [session],
      sessionApi: buildSessionApi(),
    });
    const { result, rerender } = renderHook(() => useSessionDetailVMState("pane-1"));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("does not re-render the memoized NotesSection when an unrelated sessions tick updates base state (T15a)", async () => {
    notesPollingCallCount = 0;
    const sessionApi = buildSessionApi({ requestRepoNotes: vi.fn(async () => []) });
    mockSessionsContext = buildSessionContext({ sessions: [session], sessionApi });

    let renderResult!: ReturnType<typeof render>;
    await act(async () => {
      renderResult = render(
        <SessionDetailProvider paneId="pane-1">
          <NotesProbe />
        </SessionDetailProvider>,
      );
    });

    const notesRendersAfterMount = notesPollingCallCount;
    expect(notesRendersAfterMount).toBeGreaterThan(0);

    // Simulate an unrelated SSE tick: a freshly parsed session object for the
    // same pane with an unrelated field changed (lastEventAt), while
    // notes-relevant data (repoRoot) stays the same.
    const tickedSession = { ...session, lastEventAt: "2026-01-01T00:00:01.000Z" };
    mockSessionsContext = buildSessionContext({ sessions: [tickedSession], sessionApi });

    await act(async () => {
      renderResult.rerender(
        <SessionDetailProvider paneId="pane-1">
          <NotesProbe />
        </SessionDetailProvider>,
      );
    });

    expect(notesPollingCallCount).toBe(notesRendersAfterMount);
  });
});
