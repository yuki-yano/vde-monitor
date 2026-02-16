export type SessionStateValue =
  | "RUNNING"
  | "WAITING_INPUT"
  | "WAITING_PERMISSION"
  | "SHELL"
  | "UNKNOWN";

export type AllowedKey =
  | "Enter"
  | "Escape"
  | "Tab"
  | "BTab"
  | "C-Tab"
  | "C-BTab"
  | "Space"
  | "BSpace"
  | "Up"
  | "Down"
  | "Left"
  | "Right"
  | "C-Up"
  | "C-Down"
  | "C-Left"
  | "C-Right"
  | "C-Enter"
  | "C-Escape"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown"
  | "C-a"
  | "C-b"
  | "C-c"
  | "C-d"
  | "C-e"
  | "C-f"
  | "C-g"
  | "C-h"
  | "C-i"
  | "C-j"
  | "C-k"
  | "C-l"
  | "C-m"
  | "C-n"
  | "C-o"
  | "C-p"
  | "C-q"
  | "C-r"
  | "C-s"
  | "C-t"
  | "C-u"
  | "C-v"
  | "C-w"
  | "C-x"
  | "C-y"
  | "C-z"
  | "C-\\"
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9"
  | "F10"
  | "F11"
  | "F12";

export type RawItem = { kind: "text"; value: string } | { kind: "key"; value: AllowedKey };

export type SessionSummary = {
  paneId: string;
  sessionName: string;
  windowIndex: number;
  paneIndex: number;
  windowActivity: number | null;
  paneActive: boolean;
  currentCommand: string | null;
  currentPath: string | null;
  paneTty: string | null;
  title: string | null;
  customTitle: string | null;
  branch?: string | null;
  worktreePath?: string | null;
  worktreeDirty?: boolean | null;
  worktreeLocked?: boolean | null;
  worktreeLockOwner?: string | null;
  worktreeLockReason?: string | null;
  worktreeMerged?: boolean | null;
  repoRoot: string | null;
  agent: "codex" | "claude" | "unknown";
  state: SessionStateValue;
  stateReason: string;
  lastMessage: string | null;
  lastOutputAt: string | null;
  lastEventAt: string | null;
  lastInputAt: string | null;
  paneDead: boolean;
  alternateOn: boolean;
  pipeAttached: boolean;
  pipeConflict: boolean;
};

export type SessionDetail = SessionSummary & {
  startCommand: string | null;
  panePid: number | null;
};

export type DiffFileStatus = "A" | "M" | "D" | "R" | "C" | "U" | "?";

export type DiffSummaryFile = {
  path: string;
  status: DiffFileStatus;
  staged: boolean;
  renamedFrom?: string;
  additions?: number | null;
  deletions?: number | null;
};

export type DiffSummary = {
  repoRoot: string | null;
  rev: string | null;
  generatedAt: string;
  files: DiffSummaryFile[];
  truncated?: boolean;
  reason?: "not_git" | "cwd_unknown" | "error";
};

export type CommitSummary = {
  hash: string;
  shortHash: string;
  subject: string;
  body: string | null;
  authorName: string;
  authorEmail: string | null;
  authoredAt: string;
};

export type CommitLog = {
  repoRoot: string | null;
  rev: string | null;
  generatedAt: string;
  commits: CommitSummary[];
  totalCount?: number | null;
  truncated?: boolean;
  reason?: "not_git" | "cwd_unknown" | "error";
};

export type CommitFile = {
  path: string;
  status: DiffFileStatus;
  additions: number | null;
  deletions: number | null;
  renamedFrom?: string;
};

export type CommitFileDiff = {
  path: string;
  status: DiffFileStatus;
  patch: string | null;
  binary: boolean;
  truncated?: boolean;
};

export type CommitDetail = {
  hash: string;
  shortHash: string;
  subject: string;
  body: string | null;
  authorName: string;
  authorEmail: string | null;
  authoredAt: string;
  files: CommitFile[];
};

export type DiffFile = {
  path: string;
  status: DiffFileStatus;
  patch: string | null;
  binary: boolean;
  truncated?: boolean;
  rev: string | null;
};

export type RepoFileNodeKind = "file" | "directory";

export type RepoFileTreeNode = {
  path: string;
  name: string;
  kind: RepoFileNodeKind;
  hasChildren?: boolean;
  isIgnored?: boolean;
};

export type RepoFileTreePage = {
  basePath: string;
  entries: RepoFileTreeNode[];
  nextCursor?: string;
};

export type RepoFileSearchItem = {
  path: string;
  name: string;
  kind: RepoFileNodeKind;
  score: number;
  highlights: number[];
  isIgnored?: boolean;
};

export type RepoFileSearchPage = {
  query: string;
  items: RepoFileSearchItem[];
  nextCursor?: string;
  truncated: boolean;
  totalMatchedCount: number;
};

export type RepoFileLanguageHint =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "json"
  | "yaml"
  | "bash"
  | "markdown"
  | "diff"
  | "dockerfile"
  | "text";

export type RepoFileContent = {
  path: string;
  sizeBytes: number;
  isBinary: boolean;
  truncated: boolean;
  languageHint: RepoFileLanguageHint | null;
  content: string | null;
};

export type WorktreePrStatus = "none" | "open" | "merged" | "closed_unmerged" | "unknown";

export type WorktreeListEntry = {
  path: string;
  branch: string | null;
  dirty: boolean | null;
  locked: boolean | null;
  lockOwner: string | null;
  lockReason: string | null;
  merged: boolean | null;
  prStatus?: WorktreePrStatus | null;
  ahead?: number | null;
  behind?: number | null;
  fileChanges?: {
    add: number;
    m: number;
    d: number;
  } | null;
  additions?: number | null;
  deletions?: number | null;
};

export type WorktreeList = {
  repoRoot: string | null;
  currentPath: string | null;
  baseBranch?: string | null;
  entries: WorktreeListEntry[];
};
export type RepoNote = {
  id: string;
  repoRoot: string;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};
export type FileNavigatorConfig = {
  includeIgnoredPaths: string[];
  autoExpandMatchLimit: number;
};

export type ApiErrorCode =
  | "INVALID_PANE"
  | "INVALID_PAYLOAD"
  | "DANGEROUS_COMMAND"
  | "NOT_FOUND"
  | "REPO_UNAVAILABLE"
  | "FORBIDDEN_PATH"
  | "PERMISSION_DENIED"
  | "TMUX_UNAVAILABLE"
  | "WEZTERM_UNAVAILABLE"
  | "RATE_LIMIT"
  | "INTERNAL";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
};

export type ApiEnvelope<T> = T & {
  error?: ApiError;
};

export type ScreenResponse = {
  ok: boolean;
  paneId: string;
  mode: "text" | "image";
  capturedAt: string;
  cursor?: string;
  lines?: number;
  truncated?: boolean | null;
  alternateOn?: boolean;
  screen?: string;
  full?: boolean;
  deltas?: ScreenDelta[];
  imageBase64?: string;
  cropped?: boolean;
  fallbackReason?: "image_failed" | "image_disabled";
  error?: ApiError;
};

export type ScreenDelta = {
  start: number;
  deleteCount: number;
  insertLines: string[];
};

export type SessionStateTimelineRange = "15m" | "1h" | "3h" | "6h" | "24h";
export type SessionStateTimelineScope = "pane" | "repo";

export type SessionStateTimelineSource = "poll" | "hook" | "restore";

export type SessionStateTimelineItem = {
  id: string;
  paneId: string;
  state: SessionStateValue;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  source: SessionStateTimelineSource;
};

export type SessionStateTimeline = {
  paneId: string;
  now: string;
  range: SessionStateTimelineRange;
  items: SessionStateTimelineItem[];
  totalsMs: Record<SessionStateValue, number>;
  current: SessionStateTimelineItem | null;
};

export type CommandResponse = {
  ok: boolean;
  error?: ApiError;
};

export type LaunchAgent = "codex" | "claude";

export type LaunchRollback = {
  attempted: boolean;
  ok: boolean;
  message?: string;
};

export type LaunchVerification = {
  status: "verified" | "timeout" | "mismatch" | "skipped";
  observedCommand: string | null;
  attempts: number;
};

export type LaunchAgentResult = {
  sessionName: string;
  agent: LaunchAgent;
  windowId: string;
  windowIndex: number;
  windowName: string;
  paneId: string;
  launchedCommand: LaunchAgent;
  resolvedOptions: string[];
  verification: LaunchVerification;
};

export type LaunchCommandResponse =
  | { ok: true; result: LaunchAgentResult; rollback: LaunchRollback }
  | { ok: false; error: ApiError; rollback: LaunchRollback };

export type ImageAttachment = {
  path: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  createdAt: string;
  insertText: string;
};

export type WsEnvelope<TType extends string, TData> = {
  type: TType;
  ts: string;
  reqId?: string;
  data: TData;
};

export type WsClientMessage =
  | WsEnvelope<
      "screen.request",
      { paneId: string; lines?: number; mode?: "text" | "image"; cursor?: string }
    >
  | WsEnvelope<"send.text", { paneId: string; text: string; enter?: boolean }>
  | WsEnvelope<"send.keys", { paneId: string; keys: AllowedKey[] }>
  | WsEnvelope<"send.raw", { paneId: string; items: RawItem[]; unsafe?: boolean }>
  | WsEnvelope<"client.ping", Record<string, never>>;

export type WsServerMessage =
  | WsEnvelope<"sessions.snapshot", { sessions: SessionSummary[] }>
  | WsEnvelope<"session.updated", { session: SessionSummary }>
  | WsEnvelope<"session.removed", { paneId: string }>
  | WsEnvelope<"server.health", ServerHealth>
  | WsEnvelope<"screen.response", ScreenResponse>
  | WsEnvelope<"command.response", CommandResponse>;

export type ClaudeHookEvent = {
  ts: string;
  hook_event_name: "PreToolUse" | "PostToolUse" | "Notification" | "Stop" | "UserPromptSubmit";
  notification_type?: "permission_prompt";
  session_id: string;
  cwd?: string;
  tty?: string;
  tmux_pane?: string | null;
  transcript_path?: string;
  fallback?: { cwd?: string; transcript_path?: string };
  payload: { raw: string };
};

export type HighlightCorrectionConfig = {
  codex: boolean;
  claude: boolean;
};

export type ClientScreenConfig = {
  highlightCorrection: HighlightCorrectionConfig;
};

export type ClientFileNavigatorConfig = {
  autoExpandMatchLimit: number;
};

export type ClientConfig = {
  screen: ClientScreenConfig;
  fileNavigator: ClientFileNavigatorConfig;
  launch: LaunchConfig;
};

export type ServerHealth = {
  version: string;
  clientConfig?: ClientConfig;
};

export type AgentLaunchOptionsConfig = {
  options: string[];
};

export type LaunchConfig = {
  agents: {
    codex: AgentLaunchOptionsConfig;
    claude: AgentLaunchOptionsConfig;
  };
};

export type AgentMonitorConfigBase = {
  bind: "127.0.0.1" | "0.0.0.0";
  port: number;
  attachOnServe: boolean;
  allowedOrigins: string[];
  rateLimit: {
    send: { windowMs: number; max: number };
    screen: { windowMs: number; max: number };
    raw: { windowMs: number; max: number };
  };
  dangerKeys: string[];
  dangerCommandPatterns: string[];
  activity: {
    pollIntervalMs: number;
    vwGhRefreshIntervalMs: number;
    runningThresholdMs: number;
    inactiveThresholdMs: number;
  };
  hooks: {
    ttyCacheTtlMs: number;
    ttyCacheMax: number;
  };
  input: { maxTextLength: number; enterKey: string; enterDelayMs: number };
  screen: {
    mode: "text" | "image";
    defaultLines: number;
    maxLines: number;
    includeTruncated: boolean;
    joinLines: boolean;
    ansi: boolean;
    altScreen: "auto" | "on" | "off";
    highlightCorrection: HighlightCorrectionConfig;
    image: {
      enabled: boolean;
      backend: "alacritty" | "terminal" | "iterm" | "wezterm" | "ghostty";
      format: "png";
      cropPane: boolean;
      timeoutMs: number;
    };
  };
  logs: { maxPaneLogBytes: number; maxEventLogBytes: number; retainRotations: number };
  multiplexer: {
    backend: "tmux" | "wezterm";
    wezterm: {
      cliPath: string;
      target: string | null;
    };
  };
  launch: LaunchConfig;
  fileNavigator: FileNavigatorConfig;
  tmux: { socketName: string | null; socketPath: string | null; primaryClient: string | null };
};

export type AgentMonitorConfig = AgentMonitorConfigBase & {
  token: string;
};

export type AgentMonitorConfigFile = AgentMonitorConfigBase;

export type PaneMeta = {
  paneId: string;
  sessionName: string;
  windowIndex: number;
  paneIndex: number;
  windowActivity: number | null;
  paneActivity: number | null;
  paneActive: boolean;
  currentCommand: string | null;
  currentPath: string | null;
  paneTty: string | null;
  paneDead: boolean;
  panePipe: boolean;
  alternateOn: boolean;
  panePid: number | null;
  paneTitle: string | null;
  paneStartCommand: string | null;
  pipeTagValue: string | null;
};

export type HookStateSignal = {
  state: SessionStateValue;
  reason: string;
  at: string;
};

export type StateSignals = {
  paneDead: boolean;
  lastOutputAt: string | null;
  hookState: HookStateSignal | null;
  thresholds: { runningThresholdMs: number; inactiveThresholdMs: number };
};
