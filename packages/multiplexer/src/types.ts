import type {
  AllowedKey,
  ApiError,
  LaunchAgent,
  LaunchAgentResult,
  LaunchResumePolicy,
  LaunchResumeTarget,
  LaunchRollback,
  LaunchVerification,
  RawItem,
  ResolvedConfig,
  TextCaptureOptions,
  TextCaptureResult,
} from "@vde-monitor/shared";

// ---- Config types (formerly in @vde-monitor/shared) ----

export type AgentMonitorConfig = ResolvedConfig & {
  token: string;
};

export type AgentMonitorConfigFile = ResolvedConfig;

// ---- Pane metadata (formerly in @vde-monitor/shared) ----

export type PaneMeta = {
  paneId: string;
  sessionId: string;
  sessionName: string;
  windowId: string;
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

// ---- Hook / state signal types (formerly in @vde-monitor/shared) ----

export type AgentLifecycle =
  | "RUNNING"
  | "WAITING_INPUT"
  | "WAITING_PERMISSION"
  | "SHELL"
  | "UNKNOWN";

export type HookStateSignal = {
  state: AgentLifecycle;
  reason: string;
  at: string;
};

export type HerdrAgentStatusSignal = {
  agentStatus: "working" | "blocked" | "done" | "idle";
  at: string;
};

export type StateSignals = {
  paneDead: boolean;
  lastOutputAt: string | null;
  hookState: HookStateSignal | null;
  herdrAgentStatus?: HerdrAgentStatusSignal | null;
  codexQuestionPromptActive?: boolean;
  thresholds: { runningThresholdMs: number; inactiveThresholdMs: number };
};

// ---- Multiplexer abstraction types (formerly in apps/server/src/multiplexer/types.ts) ----

export type MultiplexerBackend = "tmux" | "wezterm" | "herdr" | "cmux";

export type MultiplexerInspector = {
  listPanes: () => Promise<PaneMeta[]>;
  readUserOption: (paneId: string, key: string) => Promise<string | null>;
};

export type TextCaptureBatchRequest = {
  requestId: string;
  options: TextCaptureOptions;
};

export type TextCaptureBatchResult =
  | { requestId: string; result: TextCaptureResult; error?: never }
  | { requestId: string; result?: never; error: string };

export type MultiplexerScreenCapture = {
  captureText: (
    options: TextCaptureOptions,
    execution?: { signal?: AbortSignal },
  ) => Promise<TextCaptureResult>;
  captureTextBatch: (
    requests: TextCaptureBatchRequest[],
    execution?: { signal?: AbortSignal },
  ) => Promise<TextCaptureBatchResult[]>;
};

export type MultiplexerActionResult =
  | { ok: true; error?: undefined }
  | { ok: false; error: ApiError };

export type LaunchAgentInSessionInput = {
  sessionName: string;
  agent: LaunchAgent;
  requestId?: string;
  windowName?: string;
  cwd?: string;
  agentOptions?: string[];
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing?: boolean;
  resumeSessionId?: string;
  resumeFromPaneId?: string;
  resumePolicy?: LaunchResumePolicy;
  resumeTarget?: LaunchResumeTarget;
};

export type MultiplexerLaunchRollback = LaunchRollback;
export type MultiplexerLaunchVerification = LaunchVerification;
export type LaunchAgentInSessionResult = LaunchAgentResult;

export type MultiplexerLaunchResult =
  | { ok: true; result: LaunchAgentInSessionResult; rollback: MultiplexerLaunchRollback }
  | { ok: false; error: ApiError; rollback: MultiplexerLaunchRollback };

export type MultiplexerInputActions = {
  sendText: (paneId: string, text: string, enter?: boolean) => Promise<MultiplexerActionResult>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<MultiplexerActionResult>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<MultiplexerActionResult>;
  clearPaneTitle: (paneId: string) => Promise<MultiplexerActionResult>;
  focusPane: (paneId: string) => Promise<MultiplexerActionResult>;
  killPane: (paneId: string) => Promise<MultiplexerActionResult>;
  killWindow: (paneId: string, windowId: string) => Promise<MultiplexerActionResult>;
};

export type MultiplexerPipeState = {
  panePipe: boolean;
  pipeTagValue: string | null;
};

export type MultiplexerPipeCapability = {
  getOwnerTag: (logPath: string) => string;
  hasConflict: (state: MultiplexerPipeState, logPath: string) => boolean;
  isPipeHealthy: (paneId: string, logPath: string) => Promise<boolean>;
  attachPipe: (
    paneId: string,
    logPath: string,
    state: MultiplexerPipeState,
  ) => Promise<{ attached: boolean; conflict: boolean }>;
  detachOwnedPipe: (
    paneId: string,
    logPath: string,
  ) => Promise<{ ok: boolean; owned: boolean; detached: boolean }>;
};

export type MultiplexerLaunchCapability = {
  launchAgentInSession: (input: LaunchAgentInSessionInput) => Promise<MultiplexerLaunchResult>;
};

export type MultiplexerCapabilities = {
  pipe?: MultiplexerPipeCapability;
  launch?: MultiplexerLaunchCapability;
};

export type MultiplexerRuntime = {
  backend: MultiplexerBackend;
  serverKey: string;
  inspector: MultiplexerInspector;
  screenCapture: MultiplexerScreenCapture;
  actions: MultiplexerInputActions;
  capabilities: MultiplexerCapabilities;
  dispose?: () => void | Promise<void>;
};
