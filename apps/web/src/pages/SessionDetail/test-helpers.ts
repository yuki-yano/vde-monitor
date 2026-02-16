import type {
  CommitDetail,
  CommitFileDiff,
  CommitLog,
  DiffFile,
  DiffSummary,
  SessionDetail,
} from "@vde-monitor/shared";

export const createSessionDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "pane-1",
  sessionName: "session-1",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: "bash",
  currentPath: "/Users/test/repo",
  paneTty: "ttys000",
  title: "Session Title",
  customTitle: null,
  branch: null,
  worktreePath: null,
  worktreeDirty: null,
  worktreeLocked: null,
  worktreeLockOwner: null,
  worktreeLockReason: null,
  worktreeMerged: null,
  repoRoot: "/Users/test/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: 1234,
  ...overrides,
});

export const createDiffSummary = (overrides: Partial<DiffSummary> = {}): DiffSummary => ({
  repoRoot: "/Users/test/repo",
  rev: "HEAD",
  generatedAt: new Date(0).toISOString(),
  files: [
    {
      path: "src/index.ts",
      status: "M",
      staged: false,
      additions: 1,
      deletions: 0,
    },
  ],
  ...overrides,
});

export const createDiffFile = (overrides: Partial<DiffFile> = {}): DiffFile => ({
  path: "src/index.ts",
  status: "M",
  patch: "+console.log('hello')",
  binary: false,
  truncated: false,
  rev: "HEAD",
  ...overrides,
});

export const createCommitLog = (overrides: Partial<CommitLog> = {}): CommitLog => ({
  repoRoot: "/Users/test/repo",
  rev: "HEAD",
  generatedAt: new Date(0).toISOString(),
  commits: [
    {
      hash: "abc123",
      shortHash: "abc123",
      subject: "Initial commit",
      body: null,
      authorName: "Tester",
      authorEmail: "test@example.com",
      authoredAt: new Date(0).toISOString(),
    },
  ],
  totalCount: 1,
  ...overrides,
});

export const createCommitDetail = (overrides: Partial<CommitDetail> = {}): CommitDetail => ({
  hash: "abc123",
  shortHash: "abc123",
  subject: "Initial commit",
  body: "Body",
  authorName: "Tester",
  authorEmail: "test@example.com",
  authoredAt: new Date(0).toISOString(),
  files: [
    {
      path: "src/index.ts",
      status: "M",
      additions: 1,
      deletions: 0,
    },
  ],
  ...overrides,
});

export const createCommitFileDiff = (overrides: Partial<CommitFileDiff> = {}): CommitFileDiff => ({
  path: "src/index.ts",
  status: "M",
  patch: "+console.log('hello')",
  binary: false,
  truncated: false,
  ...overrides,
});

export const createDeferred = <T>() => {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve: (value: T) => resolve?.(value) };
};
