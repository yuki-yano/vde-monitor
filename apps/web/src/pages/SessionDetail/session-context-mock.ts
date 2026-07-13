import type { SessionSummary } from "@vde-monitor/shared";
import { vi } from "vitest";

import { defaultLaunchConfig } from "@/state/launch-agent-options";
import type {
  SessionBranchesApiContextValue,
  SessionConfigDataContextValue,
  SessionCoreApiContextValue,
  SessionFilesApiContextValue,
  SessionLaunchApiContextValue,
  SessionNotesApiContextValue,
  SessionStreamDataContextValue,
} from "@/state/session-context";

/**
 * Shared builders for the mock object that SessionDetailProvider.test.tsx and
 * SessionDetailPage.integration.test.tsx feed to session-context's 7 context
 * hooks (`vi.mock("@/state/session-context", ...)`). Both suites stub every
 * hook with the same merged object, so this factors the ~30 vi.fn() defaults
 * into one place per domain -- typed against the real exported Context value
 * types via `satisfies` -- instead of two independent hand-written copies.
 */

export const createSessionStreamDataMock = (
  overrides: Partial<SessionStreamDataContextValue> = {},
) =>
  ({
    sessions: [] as SessionSummary[],
    connected: true,
    hasLoadedInitialSessions: true,
    connectionStatus: "healthy",
    connectionIssue: null,
    transport: "sse",
    getSessionDetail: () => null,
    ...overrides,
  }) satisfies SessionStreamDataContextValue;

export const createSessionConfigDataMock = (
  overrides: Partial<SessionConfigDataContextValue> = {},
) =>
  ({
    token: "token",
    apiBaseUrl: null,
    authError: null,
    highlightCorrections: { codex: false, claude: true },
    fileNavigatorConfig: { autoExpandMatchLimit: 100 },
    launchConfig: defaultLaunchConfig,
    capabilities: {
      screenImage: true,
      launchAgent: true,
      resumeAgent: true,
    },
    ...overrides,
  }) satisfies SessionConfigDataContextValue;

export const createSessionCoreApiMock = (overrides: Partial<SessionCoreApiContextValue> = {}) =>
  ({
    setToken: vi.fn(),
    reconnect: vi.fn(),
    refreshSessions: vi.fn(),
    requestStateTimeline: vi.fn(),
    requestScreen: vi.fn(),
    focusPane: vi.fn(),
    killPane: vi.fn(),
    killWindow: vi.fn(),
    uploadImageAttachment: vi.fn(),
    sendText: vi.fn(),
    sendKeys: vi.fn(),
    sendRaw: vi.fn(),
    touchSession: vi.fn(),
    acknowledgeSessionView: vi.fn(),
    updateSessionTitle: vi.fn(),
    resetSessionTitle: vi.fn(),
    ...overrides,
  }) satisfies SessionCoreApiContextValue;

export const createSessionBranchesApiMock = (
  overrides: Partial<SessionBranchesApiContextValue> = {},
) =>
  ({
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
    requestDiffSummary: vi.fn(),
    requestDiffFile: vi.fn(),
    requestCommitLog: vi.fn(),
    requestCommitDetail: vi.fn(),
    requestCommitFile: vi.fn(),
    ...overrides,
  }) satisfies SessionBranchesApiContextValue;

export const createSessionFilesApiMock = (overrides: Partial<SessionFilesApiContextValue> = {}) =>
  ({
    requestRepoFileTree: vi.fn(async () => ({ basePath: ".", entries: [] })),
    requestRepoFileSearch: vi.fn(),
    requestRepoFileContent: vi.fn(),
    ...overrides,
  }) satisfies SessionFilesApiContextValue;

export const createSessionNotesApiMock = (overrides: Partial<SessionNotesApiContextValue> = {}) =>
  ({
    requestRepoNotes: vi.fn(),
    createRepoNote: vi.fn(),
    updateRepoNote: vi.fn(),
    deleteRepoNote: vi.fn(),
    ...overrides,
  }) satisfies SessionNotesApiContextValue;

export const createSessionLaunchApiMock = (overrides: Partial<SessionLaunchApiContextValue> = {}) =>
  ({
    launchAgentInSession: vi.fn(),
    ...overrides,
  }) satisfies SessionLaunchApiContextValue;

export type SessionContextMockOverrides = {
  stream?: Partial<SessionStreamDataContextValue>;
  config?: Partial<SessionConfigDataContextValue>;
  core?: Partial<SessionCoreApiContextValue>;
  branches?: Partial<SessionBranchesApiContextValue>;
  files?: Partial<SessionFilesApiContextValue>;
  notes?: Partial<SessionNotesApiContextValue>;
  launch?: Partial<SessionLaunchApiContextValue>;
};

/**
 * Builds the single flat object both test files pass to every one of
 * session-context's 7 hook mocks. Real consumers only ever read from their
 * own Context slice, so a flat merge of all 7 domains is a faithful stand-in
 * for "every context populated" without standing up 7 separate Providers.
 */
export const createSessionContextMock = (overrides: SessionContextMockOverrides = {}) => ({
  ...createSessionStreamDataMock(overrides.stream),
  ...createSessionConfigDataMock(overrides.config),
  ...createSessionCoreApiMock(overrides.core),
  ...createSessionBranchesApiMock(overrides.branches),
  ...createSessionFilesApiMock(overrides.files),
  ...createSessionNotesApiMock(overrides.notes),
  ...createSessionLaunchApiMock(overrides.launch),
});
