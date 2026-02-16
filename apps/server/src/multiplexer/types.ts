import type {
  AllowedKey,
  ApiError,
  LaunchAgent,
  LaunchAgentResult,
  LaunchRollback,
  LaunchVerification,
  PaneMeta,
  RawItem,
} from "@vde-monitor/shared";

export type MultiplexerBackend = "tmux" | "wezterm";

type MultiplexerTextCaptureOptions = {
  paneId: string;
  lines: number;
  joinLines: boolean;
  includeAnsi: boolean;
  includeTruncated?: boolean;
  altScreen: "auto" | "on" | "off";
  alternateOn: boolean;
  currentCommand?: string | null;
};

type MultiplexerTextCaptureResult = {
  screen: string;
  truncated: boolean | null;
  alternateOn: boolean;
};

export type MultiplexerInspector = {
  listPanes: () => Promise<PaneMeta[]>;
  readUserOption: (paneId: string, key: string) => Promise<string | null>;
};

export type MultiplexerScreenCapture = {
  captureText: (options: MultiplexerTextCaptureOptions) => Promise<MultiplexerTextCaptureResult>;
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
  focusPane: (paneId: string) => Promise<MultiplexerActionResult>;
  killPane: (paneId: string) => Promise<MultiplexerActionResult>;
  killWindow: (paneId: string) => Promise<MultiplexerActionResult>;
  launchAgentInSession: (input: LaunchAgentInSessionInput) => Promise<MultiplexerLaunchResult>;
};

export type MultiplexerRuntime = {
  backend: MultiplexerBackend;
  serverKey: string;
  inspector: MultiplexerInspector;
  screenCapture: MultiplexerScreenCapture;
  actions: MultiplexerInputActions;
  pipeManager: {
    hasConflict: (state: { panePipe: boolean; pipeTagValue: string | null }) => boolean;
    attachPipe: (
      paneId: string,
      logPath: string,
      state: { panePipe: boolean; pipeTagValue: string | null },
      options?: { forceReattach?: boolean },
    ) => Promise<{ attached: boolean; conflict: boolean }>;
  };
  captureFingerprint: (paneId: string, useAlt: boolean) => Promise<string | null>;
  pipeSupport: "tmux-pipe" | "none";
};
