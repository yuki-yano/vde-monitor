import { act, renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { screenTextAtom } from "./atoms/screenAtoms";
import {
  connectedAtom,
  connectionIssueAtom,
  highlightCorrectionsAtom,
  paneIdAtom,
  resolvedThemeAtom,
  sessionApiAtom,
  sessionsAtom,
} from "./atoms/sessionDetailAtoms";
import { createSessionDetail } from "./test-helpers";
import { useSessionDetailVM } from "./useSessionDetailVM";

const session = createSessionDetail({ paneId: "pane-1" });
const sessionGroups = [{ repoRoot: null, sessions: [session] }];
const setScreenErrorMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/session-group", () => ({
  buildSessionGroups: vi.fn(() => sessionGroups),
}));

vi.mock("@/lib/use-media-query", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/lib/use-now-ms", () => ({
  useNowMs: () => 123,
}));

vi.mock("@/lib/use-sidebar-width", () => ({
  useSidebarWidth: () => ({ sidebarWidth: 240, handlePointerDown: vi.fn() }),
}));

vi.mock("@/lib/use-split-ratio", () => ({
  useSplitRatio: () => ({
    ratio: 0.5,
    containerRef: { current: null },
    handlePointerDown: vi.fn(),
  }),
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

vi.mock("./hooks/useSessionDiffs", () => ({
  useSessionDiffs: () => ({
    diffSummary: null,
    diffError: null,
    diffLoading: false,
    diffFiles: {},
    diffOpen: {},
    diffLoadingFiles: {},
    refreshDiff: vi.fn(),
    toggleDiff: vi.fn(),
    ensureDiffFile: vi.fn(),
  }),
}));

vi.mock("./hooks/useSessionFiles", () => ({
  useSessionFiles: () => ({
    unavailable: false,
    selectedFilePath: null,
    searchQuery: "",
    searchActiveIndex: 0,
    searchResult: null,
    searchLoading: false,
    searchError: null,
    searchMode: "all-matches",
    treeLoading: false,
    treeError: null,
    treeNodes: [],
    rootTreeHasMore: false,
    searchHasMore: false,
    fileModalOpen: false,
    fileModalPath: null,
    fileModalLoading: false,
    fileModalError: null,
    fileModalFile: null,
    fileModalMarkdownViewMode: "code",
    fileModalShowLineNumbers: false,
    fileModalCopiedPath: false,
    fileModalCopyError: null,
    fileModalHighlightLine: null,
    fileResolveError: null,
    logFileCandidateModalOpen: false,
    logFileCandidateReference: null,
    logFileCandidatePaneId: null,
    logFileCandidateItems: [],
    onRefresh: vi.fn(),
    onSearchQueryChange: vi.fn(),
    onSearchMove: vi.fn(),
    onSearchConfirm: vi.fn(),
    onToggleDirectory: vi.fn(),
    onSelectFile: vi.fn(),
    onOpenFileModal: vi.fn(),
    onCloseFileModal: vi.fn(),
    onSetFileModalMarkdownViewMode: vi.fn(),
    onToggleFileModalLineNumbers: vi.fn(),
    onCopyFileModalPath: vi.fn(),
    onResolveLogFileReference: vi.fn(async () => undefined),
    onResolveLogFileReferenceCandidates: vi.fn(async () => []),
    onSelectLogFileCandidate: vi.fn(),
    onCloseLogFileCandidateModal: vi.fn(),
    onLoadMoreTreeRoot: vi.fn(),
    onLoadMoreSearch: vi.fn(),
  }),
}));

vi.mock("./hooks/useSessionCommits", () => ({
  useSessionCommits: () => ({
    commitLog: null,
    commitError: null,
    commitLoading: false,
    commitLoadingMore: false,
    commitHasMore: false,
    commitDetails: {},
    commitFileDetails: {},
    commitFileOpen: {},
    commitFileLoading: {},
    commitOpen: {},
    commitLoadingDetails: {},
    copiedHash: null,
    refreshCommitLog: vi.fn(),
    loadMoreCommits: vi.fn(),
    toggleCommit: vi.fn(),
    toggleCommitFile: vi.fn(),
    copyHash: vi.fn(),
  }),
}));

vi.mock("./hooks/useSessionRepoNotes", () => ({
  useSessionRepoNotes: () => ({
    notes: [],
    notesLoading: false,
    notesError: null,
    creatingNote: false,
    savingNoteId: null,
    deletingNoteId: null,
    refreshNotes: vi.fn(),
    createNote: vi.fn(async () => true),
    saveNote: vi.fn(async () => true),
    removeNote: vi.fn(async () => true),
  }),
}));

vi.mock("./hooks/useSessionLogs", () => ({
  useSessionLogs: () => ({
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
  }),
}));

vi.mock("./hooks/useSessionTitleEditor", () => ({
  useSessionTitleEditor: () => ({
    titleDraft: "",
    titleEditing: false,
    titleSaving: false,
    titleError: null,
    openTitleEditor: vi.fn(),
    closeTitleEditor: vi.fn(),
    updateTitleDraft: vi.fn(),
    saveTitle: vi.fn(),
    resetTitle: vi.fn(),
  }),
}));

vi.mock("./hooks/useSessionTimeline", () => ({
  useSessionTimeline: () => ({
    timeline: null,
    timelineScope: "pane",
    timelineRange: "1h",
    hasRepoTimeline: true,
    timelineError: null,
    timelineLoading: false,
    timelineExpanded: true,
    setTimelineScope: vi.fn(),
    setTimelineRange: vi.fn(),
    toggleTimelineExpanded: vi.fn(),
    refreshTimeline: vi.fn(),
  }),
}));

describe("useSessionDetailVM", () => {
  it("reads base state from atoms", () => {
    const sessionApi = {
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
      requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
      createRepoNote: vi.fn(),
      updateRepoNote: vi.fn(),
      deleteRepoNote: vi.fn(),
    };

    const store = createStore();
    store.set(paneIdAtom, "pane-1");
    store.set(sessionsAtom, [session]);
    store.set(connectedAtom, true);
    store.set(connectionIssueAtom, "issue");
    store.set(highlightCorrectionsAtom, { codex: false, claude: true });
    store.set(resolvedThemeAtom, "mocha");
    store.set(sessionApiAtom, sessionApi);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(() => useSessionDetailVM("pane-1"), { wrapper });

    expect(result.current.meta.paneId).toBe("pane-1");
    expect(result.current.meta.connected).toBe(true);
    expect(result.current.meta.connectionIssue).toBe("issue");
    expect(result.current.meta.session?.paneId).toBe("pane-1");
    expect(result.current.sidebar.sessionGroups).toBe(sessionGroups);
  });

  it("sets screen error when focus pane command fails", async () => {
    setScreenErrorMock.mockClear();
    const focusPane = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMIT", message: "rate limited" },
    });
    const sessionApi = {
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
      focusPane,
      killPane: vi.fn(),
      killWindow: vi.fn(),
      launchAgentInSession: vi.fn(),
      uploadImageAttachment: vi.fn(),
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      sendRaw: vi.fn(),
      touchSession: vi.fn(),
      updateSessionTitle: vi.fn(),
      requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
      createRepoNote: vi.fn(),
      updateRepoNote: vi.fn(),
      deleteRepoNote: vi.fn(),
    };

    const store = createStore();
    store.set(paneIdAtom, "pane-1");
    store.set(sessionsAtom, [session]);
    store.set(connectedAtom, true);
    store.set(connectionIssueAtom, null);
    store.set(highlightCorrectionsAtom, { codex: false, claude: true });
    store.set(resolvedThemeAtom, "mocha");
    store.set(sessionApiAtom, sessionApi);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(() => useSessionDetailVM("pane-1"), { wrapper });

    await act(async () => {
      await result.current.actions.handleFocusPane("pane-1");
    });

    expect(focusPane).toHaveBeenCalledWith("pane-1");
    expect(setScreenErrorMock).toHaveBeenCalledWith("rate limited");
  });

  it("touches target pane when sidebar pin action is triggered", () => {
    const touchSession = vi.fn().mockResolvedValue(undefined);
    const sessionApi = {
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
      focusPane: vi.fn().mockResolvedValue({ ok: true }),
      killPane: vi.fn(),
      killWindow: vi.fn(),
      launchAgentInSession: vi.fn(),
      uploadImageAttachment: vi.fn(),
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      sendRaw: vi.fn(),
      touchSession,
      updateSessionTitle: vi.fn(),
      requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
      createRepoNote: vi.fn(),
      updateRepoNote: vi.fn(),
      deleteRepoNote: vi.fn(),
    };

    const store = createStore();
    store.set(paneIdAtom, "pane-1");
    store.set(sessionsAtom, [session]);
    store.set(connectedAtom, true);
    store.set(connectionIssueAtom, null);
    store.set(highlightCorrectionsAtom, { codex: false, claude: true });
    store.set(resolvedThemeAtom, "mocha");
    store.set(sessionApiAtom, sessionApi);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(() => useSessionDetailVM("pane-1"), { wrapper });

    act(() => {
      result.current.actions.handleTouchPane("pane-2");
    });

    expect(touchSession).toHaveBeenCalledWith("pane-2");
  });

  it("derives latest codex context-left label from screen text", () => {
    const sessionApi = {
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
      requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
      createRepoNote: vi.fn(),
      updateRepoNote: vi.fn(),
      deleteRepoNote: vi.fn(),
    };

    const store = createStore();
    store.set(paneIdAtom, "pane-1");
    store.set(sessionsAtom, [session]);
    store.set(connectedAtom, true);
    store.set(connectionIssueAtom, null);
    store.set(highlightCorrectionsAtom, { codex: false, claude: true });
    store.set(resolvedThemeAtom, "mocha");
    store.set(screenTextAtom, "91% context left\n\u001b[32m74% context left\u001b[0m");
    store.set(sessionApiAtom, sessionApi);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(() => useSessionDetailVM("pane-1"), { wrapper });

    expect(result.current.screen.contextLeftLabel).toBe("74% context left");
  });

  it("ignores context-left label for non-codex sessions", () => {
    const sessionApi = {
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
      requestWorktrees: vi.fn(async () => ({ repoRoot: null, currentPath: null, entries: [] })),
      createRepoNote: vi.fn(),
      updateRepoNote: vi.fn(),
      deleteRepoNote: vi.fn(),
    };

    const store = createStore();
    store.set(paneIdAtom, "pane-1");
    store.set(sessionsAtom, [createSessionDetail({ paneId: "pane-1", agent: "claude" })]);
    store.set(connectedAtom, true);
    store.set(connectionIssueAtom, null);
    store.set(highlightCorrectionsAtom, { codex: false, claude: true });
    store.set(resolvedThemeAtom, "mocha");
    store.set(screenTextAtom, "63% context left");
    store.set(sessionApiAtom, sessionApi);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(() => useSessionDetailVM("pane-1"), { wrapper });

    expect(result.current.screen.contextLeftLabel).toBeNull();
  });
});
