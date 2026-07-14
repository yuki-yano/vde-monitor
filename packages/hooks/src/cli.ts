#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createConnection as createNetConnection } from "node:net";
import os from "node:os";
import path from "node:path";

import {
  type ClaudeHookEvent,
  type CodexHookEvent,
  configDefaults,
  pickUserConfigAllowlist,
  userConfigSchema,
} from "@vde-monitor/shared";
import {
  resolveConfigDir,
  resolveConfigFilePath,
  resolveMonitorRuntimeMarkerDirectory,
  resolveMonitorServerKey,
} from "@vde-monitor/shared/node";
import YAML from "yaml";

import { isMainModule } from "./main-module";
import { parseJsonObject } from "./parse-json-object";

type HookPayload = Record<string, unknown>;
type ProcessSnapshot = {
  ppid: number;
  command: string;
};

type HookPayloadBaseFields = {
  sessionId?: string;
  cwd?: string;
  tty?: string;
  tmuxPane: string | null;
  herdrPane?: string | null;
  cmuxSurface?: string | null;
  transcriptPath?: string | null;
};

type HookPayloadFields = HookPayloadBaseFields & {
  notificationType?: ClaudeHookEvent["notification_type"];
};

type CodexHookPayloadFields = HookPayloadBaseFields;

export type HookEvent = ClaudeHookEvent;
type HookEventName = ClaudeHookEvent["hook_event_name"];
type CodexHookEventName = CodexHookEvent["hook_event_name"];

export type HookAgent = "claude" | "codex";
type HerdrAgentStatus = "working" | "blocked" | "idle";

type HookServerConfig = {
  bind: "127.0.0.1" | "0.0.0.0";
  port: number;
  multiplexerBackend: "tmux" | "wezterm" | "herdr" | "cmux";
  tmuxSocketName: string | null;
  tmuxSocketPath: string | null;
  weztermTarget: string | null;
  cmuxSocketPath?: string | null;
};

const readStdin = (): string => {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
};

const encodeClaudeCwd = (cwd: string): string => {
  return cwd.replace(/\//g, "-");
};

export const resolveTranscriptPath = (
  cwd: string | undefined,
  sessionId: string | undefined,
): string | null => {
  if (!cwd || !sessionId) {
    return null;
  }
  const primaryEncoded = encodeClaudeCwd(cwd);
  const legacyEncoded = cwd.replace(/[/.]/g, "-");
  const encodedCandidates =
    primaryEncoded === legacyEncoded ? [primaryEncoded] : [primaryEncoded, legacyEncoded];
  const resolvedEncoded =
    encodedCandidates.find((encoded) =>
      fs.existsSync(path.join(os.homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`)),
    ) ?? primaryEncoded;
  return path.join(os.homedir(), ".claude", "projects", resolvedEncoded, `${sessionId}.jsonl`);
};

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
};

const toOptionalString = (value: unknown) => (typeof value === "string" ? value : undefined);

const HOOK_EVENT_NAMES = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "UserPromptSubmit",
] as const satisfies readonly HookEventName[];

const isHookEventName = (value: string): value is HookEventName =>
  HOOK_EVENT_NAMES.some((name) => name === value);

const CODEX_HOOK_EVENT_NAMES = [
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
  "UserPromptSubmit",
] as const satisfies readonly CodexHookEventName[];

const isCodexHookEventName = (value: string): value is CodexHookEventName =>
  CODEX_HOOK_EVENT_NAMES.some((name) => name === value);

export const parseHookCliArgs = (
  argv: string[],
): { agent: HookAgent; hookEventName: string } | null => {
  const [first, second] = argv;
  if (!first) {
    return null;
  }
  if (first === "codex") {
    if (!second) {
      return null;
    }
    return { agent: "codex", hookEventName: second };
  }
  return { agent: "claude", hookEventName: first };
};

const normalizeNotificationType = (value: unknown): ClaudeHookEvent["notification_type"] =>
  value === "permission_prompt" ? value : undefined;

const normalizeTmuxPane = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
};

const normalizeTty = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "?" || trimmed === "??" || trimmed === "-") {
    return null;
  }
  return trimmed.startsWith("/") ? trimmed : `/dev/${trimmed}`;
};

export const resolveProcessTty = (
  pid: number = process.ppid,
  options: { spawnSyncFn?: typeof spawnSync } = {},
): string | null => {
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    return null;
  }
  const spawnSyncFn = options.spawnSyncFn ?? spawnSync;
  const result = spawnSyncFn("ps", ["-p", String(pid), "-o", "tty="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return normalizeTty(typeof result.stdout === "string" ? result.stdout : null);
};

export const resolveTmuxPane = (
  env: NodeJS.ProcessEnv = process.env,
  options: {
    spawnSyncFn?: typeof spawnSync;
  } = {},
): string | null => {
  const directPane = normalizeTmuxPane(env.TMUX_PANE);
  if (directPane) {
    return directPane;
  }
  const spawnSyncFn = options.spawnSyncFn ?? spawnSync;
  const result = spawnSyncFn("tmux", ["display-message", "-p", "#{pane_id}"], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return normalizeTmuxPane(typeof result.stdout === "string" ? result.stdout : null);
};

const normalizeExecutableToken = (command: string): string | null => {
  const firstToken = command.trim().split(/\s+/, 1)[0];
  if (!firstToken) {
    return null;
  }
  const unquoted = firstToken.replace(/^['"]+|['"]+$/g, "");
  if (!unquoted) {
    return null;
  }
  return path.basename(unquoted);
};

const isClaudeCommand = (command: string): boolean =>
  normalizeExecutableToken(command) === "claude";

const hasClaudePrintFlag = (command: string): boolean =>
  /(?:^|\s)-p(?=\s|$)/.test(command) || /(?:^|\s)--print(?=\s|$)/.test(command);

const isCodexCommand = (command: string): boolean => normalizeExecutableToken(command) === "codex";

const hasCodexExecSubcommand = (command: string): boolean => {
  const secondToken = command.trim().split(/\s+/)[1];
  return secondToken === "exec";
};

const parseProcessSnapshot = (stdout: string): ProcessSnapshot | null => {
  const line = stdout.trim();
  if (!line) {
    return null;
  }
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const ppidText = match[1];
  const commandText = match[2];
  if (!ppidText || !commandText) {
    return null;
  }
  const ppid = Number.parseInt(ppidText, 10);
  if (!Number.isFinite(ppid) || ppid < 0) {
    return null;
  }
  const command = commandText.trim();
  if (!command) {
    return null;
  }
  return { ppid, command };
};

const lookupProcessSnapshotFromPs = (pid: number): ProcessSnapshot | null => {
  if (!Number.isFinite(pid) || pid <= 1) {
    return null;
  }
  const result = spawnSync("ps", ["-p", String(pid), "-o", "ppid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return parseProcessSnapshot(typeof result.stdout === "string" ? result.stdout : "");
};

const hasNonInteractiveAncestor = (
  parentPid: number,
  isTargetCommand: (command: string) => boolean,
  isNonInteractiveCommand: (command: string) => boolean,
  lookupProcessSnapshot: (pid: number) => ProcessSnapshot | null = lookupProcessSnapshotFromPs,
  maxDepth = 32,
): boolean => {
  if (!Number.isFinite(parentPid) || parentPid <= 1) {
    return false;
  }
  const visited = new Set<number>();
  let currentPid = parentPid;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (currentPid <= 1 || visited.has(currentPid)) {
      return false;
    }
    visited.add(currentPid);
    const snapshot = lookupProcessSnapshot(currentPid);
    if (!snapshot) {
      return false;
    }
    if (isTargetCommand(snapshot.command)) {
      return isNonInteractiveCommand(snapshot.command);
    }
    currentPid = snapshot.ppid;
  }

  return false;
};

const isResultLikePayload = (payload: HookPayload): boolean => {
  const type = toOptionalString(payload.type);
  if (!type) {
    return false;
  }
  return type === "result" || type.endsWith("_result");
};

export const isClaudeNonInteractivePayload = (
  payload: HookPayload,
  hookEventName: string,
  options: {
    parentPid?: number;
    lookupProcessSnapshot?: (pid: number) => ProcessSnapshot | null;
    maxDepth?: number;
  } = {},
): boolean => {
  if (isResultLikePayload(payload)) {
    return true;
  }
  if (hookEventName !== "Stop" && hookEventName !== "SubagentStop") {
    return false;
  }
  return hasNonInteractiveAncestor(
    options.parentPid ?? process.ppid,
    isClaudeCommand,
    hasClaudePrintFlag,
    options.lookupProcessSnapshot ?? lookupProcessSnapshotFromPs,
    options.maxDepth,
  );
};

export const shouldPersistHookPayload = (
  payload: HookPayload,
  hookEventName: string,
  options: {
    parentPid?: number;
    lookupProcessSnapshot?: (pid: number) => ProcessSnapshot | null;
    maxDepth?: number;
  } = {},
): boolean => !isClaudeNonInteractivePayload(payload, hookEventName, options);

export const isCodexNonInteractivePayload = (
  payload: HookPayload,
  hookEventName: string,
  options: {
    parentPid?: number;
    lookupProcessSnapshot?: (pid: number) => ProcessSnapshot | null;
    maxDepth?: number;
  } = {},
): boolean => {
  if (isResultLikePayload(payload)) {
    return true;
  }
  if (hookEventName !== "Stop" && hookEventName !== "SubagentStop") {
    return false;
  }
  return hasNonInteractiveAncestor(
    options.parentPid ?? process.ppid,
    isCodexCommand,
    hasCodexExecSubcommand,
    options.lookupProcessSnapshot ?? lookupProcessSnapshotFromPs,
    options.maxDepth,
  );
};

export const shouldPersistCodexHookPayload = (
  payload: HookPayload,
  hookEventName: string,
  options: {
    parentPid?: number;
    lookupProcessSnapshot?: (pid: number) => ProcessSnapshot | null;
    maxDepth?: number;
  } = {},
): boolean => !isCodexNonInteractivePayload(payload, hookEventName, options);

const resolveWithDefault = <T>(value: T | undefined, fallback: T) =>
  typeof value === "undefined" ? fallback : value;

const parseHookServerConfig = (value: unknown): HookServerConfig | null => {
  const picked = pickUserConfigAllowlist(value);
  const parsed = userConfigSchema.safeParse(picked);
  if (parsed.success) {
    const config = parsed.data;
    return {
      bind: resolveWithDefault(config.bind, configDefaults.bind),
      port: resolveWithDefault(config.port, configDefaults.port),
      multiplexerBackend: resolveWithDefault(
        config.multiplexer?.backend,
        configDefaults.multiplexer.backend,
      ),
      tmuxSocketName: resolveWithDefault(config.tmux?.socketName, configDefaults.tmux.socketName),
      tmuxSocketPath: resolveWithDefault(config.tmux?.socketPath, configDefaults.tmux.socketPath),
      weztermTarget: resolveWithDefault(
        config.multiplexer?.wezterm?.target,
        configDefaults.multiplexer.wezterm.target,
      ),
      cmuxSocketPath: resolveWithDefault(
        config.multiplexer?.cmux?.socketPath,
        configDefaults.multiplexer.cmux.socketPath,
      ),
    };
  }
  return null;
};

const resolveConfigPath = () => {
  return resolveConfigFilePath({
    configDir: resolveConfigDir(),
    readErrorPrefix: "failed to read config",
    nonRegularFileErrorPrefix: "config path exists but is not a regular file",
  });
};

const parseConfig = (raw: string, configPath: string) => {
  const ext = path.extname(configPath).toLowerCase();
  if (ext === ".json") {
    return JSON.parse(raw);
  }
  return YAML.parse(raw);
};

export const loadConfig = (): HookServerConfig | null => {
  const configPath = resolveConfigPath();
  if (!configPath) {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return parseHookServerConfig(parseConfig(raw, configPath));
  } catch {
    return null;
  }
};

type HookRuntimeMarker = {
  backend: "cmux";
  serverKey: string;
  pid: number;
  processStartedAt: string;
};

const isRunningProcess = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const resolveProcessStartedAt = (pid: number): string | null => {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  const startedAt =
    result.status === 0 && typeof result.stdout === "string" ? result.stdout.trim() : "";
  return result.error || startedAt.length === 0 ? null : startedAt;
};

export const resolveActiveHookConfig = (
  config: HookServerConfig | null,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    baseDir?: string;
    getProcessStartedAt?: (pid: number) => string | null;
    isProcessRunning?: (pid: number) => boolean;
    readDir?: (directoryPath: string) => string[];
    readFile?: (filePath: string) => string;
  } = {},
): HookServerConfig | null => {
  const surfaceId = env.CMUX_SURFACE_ID?.trim();
  const socketPath = env.CMUX_SOCKET_PATH?.trim();
  if (!surfaceId || !socketPath) return config;

  const serverKey = resolveMonitorServerKey({
    multiplexerBackend: "cmux",
    tmuxSocketName: null,
    tmuxSocketPath: null,
    weztermTarget: null,
    cmuxSocketPath: socketPath,
  });
  const baseDir = options.baseDir ?? path.join(os.homedir(), ".vde-monitor");
  const markerDirectory = resolveMonitorRuntimeMarkerDirectory(baseDir, serverKey);
  const readDir = options.readDir ?? ((directoryPath) => fs.readdirSync(directoryPath));
  const readFile = options.readFile ?? ((filePath) => fs.readFileSync(filePath, "utf8"));
  const isProcessRunningFn = options.isProcessRunning ?? isRunningProcess;
  const getProcessStartedAt = options.getProcessStartedAt ?? resolveProcessStartedAt;

  const activeMarkers: HookRuntimeMarker[] = [];
  try {
    for (const entry of readDir(markerDirectory)) {
      if (!/^\.runtime\.\d+\.json$/.test(entry)) continue;
      try {
        const marker = JSON.parse(
          readFile(path.join(markerDirectory, entry)),
        ) as Partial<HookRuntimeMarker>;
        if (
          marker.backend === "cmux" &&
          marker.serverKey === serverKey &&
          Number.isSafeInteger(marker.pid) &&
          marker.pid != null &&
          marker.pid > 0 &&
          typeof marker.processStartedAt === "string" &&
          marker.processStartedAt.length > 0 &&
          entry === `.runtime.${marker.pid}.json` &&
          isProcessRunningFn(marker.pid) &&
          getProcessStartedAt(marker.pid) === marker.processStartedAt
        ) {
          activeMarkers.push(marker as HookRuntimeMarker);
        }
      } catch {
        // Ignore malformed or concurrently removed process-owned marker files.
      }
    }
  } catch {
    return config;
  }
  if (activeMarkers.length !== 1) return config;

  return {
    bind: config?.bind ?? configDefaults.bind,
    port: config?.port ?? configDefaults.port,
    multiplexerBackend: "cmux",
    tmuxSocketName: config?.tmuxSocketName ?? configDefaults.tmux.socketName,
    tmuxSocketPath: config?.tmuxSocketPath ?? configDefaults.tmux.socketPath,
    weztermTarget: config ? config.weztermTarget : configDefaults.multiplexer.wezterm.target,
    cmuxSocketPath: socketPath,
  };
};

export const resolveHookServerKey = (
  config: HookServerConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  if (!config) {
    return resolveMonitorServerKey({
      multiplexerBackend: "tmux",
      tmuxSocketName: null,
      tmuxSocketPath: null,
      weztermTarget: null,
    });
  }
  return resolveMonitorServerKey({
    multiplexerBackend: config.multiplexerBackend,
    tmuxSocketName: config.tmuxSocketName,
    tmuxSocketPath: config.tmuxSocketPath,
    weztermTarget: config.weztermTarget,
    herdrSocketPath: env.HERDR_SOCKET_PATH,
    cmuxSocketPath: env.CMUX_SOCKET_PATH ?? config.cmuxSocketPath,
  });
};

const parsePayload = (rawInput: string): HookPayload | null => parseJsonObject(rawInput);

export const extractPayloadFields = (
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    multiplexerBackend?: HookServerConfig["multiplexerBackend"];
    resolveProcessTtyFn?: typeof resolveProcessTty;
    resolveTmuxPaneFn?: typeof resolveTmuxPane;
  } = {},
): HookPayloadFields => {
  const sessionId = toOptionalString(payload.session_id);
  const cwd = toOptionalString(payload.cwd);
  const transcriptPath =
    toOptionalString(payload.transcript_path) ?? resolveTranscriptPath(cwd, sessionId);
  const resolveTmuxPaneFn = options.resolveTmuxPaneFn ?? resolveTmuxPane;
  const includeTmuxIdentity =
    options.multiplexerBackend == null || options.multiplexerBackend === "tmux";
  const includeHerdrIdentity =
    options.multiplexerBackend == null || options.multiplexerBackend === "herdr";
  const includeCmuxIdentity =
    options.multiplexerBackend == null || options.multiplexerBackend === "cmux";
  const resolveProcessTtyFn = options.resolveProcessTtyFn ?? resolveProcessTty;
  return {
    sessionId,
    cwd,
    tty:
      options.multiplexerBackend === "cmux"
        ? (resolveProcessTtyFn() ?? undefined)
        : toOptionalString(payload.tty),
    tmuxPane: includeTmuxIdentity
      ? (toOptionalString(payload.tmux_pane) ?? resolveTmuxPaneFn(env))
      : null,
    herdrPane: includeHerdrIdentity
      ? (toOptionalString(payload.herdr_pane) ?? toOptionalString(env.HERDR_PANE_ID) ?? null)
      : null,
    cmuxSurface: includeCmuxIdentity
      ? (toOptionalString(payload.cmux_surface) ?? toOptionalString(env.CMUX_SURFACE_ID) ?? null)
      : null,
    notificationType: normalizeNotificationType(payload.notification_type),
    transcriptPath,
  };
};

export const extractCodexPayloadFields = (
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    multiplexerBackend?: HookServerConfig["multiplexerBackend"];
    resolveProcessTtyFn?: typeof resolveProcessTty;
    resolveTmuxPaneFn?: typeof resolveTmuxPane;
  } = {},
): CodexHookPayloadFields => {
  const resolveTmuxPaneFn = options.resolveTmuxPaneFn ?? resolveTmuxPane;
  const includeTmuxIdentity =
    options.multiplexerBackend == null || options.multiplexerBackend === "tmux";
  const includeHerdrIdentity =
    options.multiplexerBackend == null || options.multiplexerBackend === "herdr";
  const includeCmuxIdentity =
    options.multiplexerBackend == null || options.multiplexerBackend === "cmux";
  const resolveProcessTtyFn = options.resolveProcessTtyFn ?? resolveProcessTty;
  return {
    sessionId: toOptionalString(payload.session_id),
    cwd: toOptionalString(payload.cwd),
    tty:
      options.multiplexerBackend === "cmux"
        ? (resolveProcessTtyFn() ?? undefined)
        : toOptionalString(payload.tty),
    tmuxPane: includeTmuxIdentity
      ? (toOptionalString(payload.tmux_pane) ?? resolveTmuxPaneFn(env))
      : null,
    herdrPane: includeHerdrIdentity
      ? (toOptionalString(payload.herdr_pane) ?? toOptionalString(env.HERDR_PANE_ID) ?? null)
      : null,
    cmuxSurface: includeCmuxIdentity
      ? (toOptionalString(payload.cmux_surface) ?? toOptionalString(env.CMUX_SURFACE_ID) ?? null)
      : null,
    transcriptPath: toOptionalString(payload.transcript_path) ?? null,
  };
};

const buildFallback = (fields: HookPayloadBaseFields): HookEvent["fallback"] => {
  if (fields.tmuxPane != null || fields.herdrPane != null || fields.cmuxSurface != null) {
    return undefined;
  }
  return {
    cwd: fields.cwd,
    transcript_path: fields.transcriptPath ?? undefined,
  };
};

export const deriveHerdrAgentStatus = (
  agent: HookAgent,
  hookEventName: string,
  notificationType?: ClaudeHookEvent["notification_type"],
): HerdrAgentStatus | null => {
  if (agent === "claude" && hookEventName === "Notification") {
    return notificationType === "permission_prompt" ? "blocked" : null;
  }
  if (agent === "codex" && hookEventName === "PermissionRequest") {
    return "blocked";
  }
  if (hookEventName === "Stop") {
    return "idle";
  }
  if (
    hookEventName === "PreToolUse" ||
    hookEventName === "PostToolUse" ||
    hookEventName === "UserPromptSubmit"
  ) {
    return "working";
  }
  return null;
};

type HerdrReportSocket = {
  destroyed?: boolean;
  setEncoding: (encoding: BufferEncoding) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off: (event: string, listener: (...args: unknown[]) => void) => unknown;
  write: (line: string, callback?: (error?: Error | null) => void) => unknown;
  end: () => unknown;
  destroy: () => unknown;
};

type HerdrReporterOptions = {
  socketPath: string;
  paneId: string;
  createConnection?: (socketPath: string) => HerdrReportSocket;
  now?: () => number;
  connectTimeoutMs?: number;
};

export const createHerdrReporter = ({
  socketPath,
  paneId,
  createConnection = (pathValue) => createNetConnection(pathValue),
  now = () => Date.now(),
  connectTimeoutMs = 500,
}: HerdrReporterOptions) => {
  let seq = 0;

  const report = async ({
    agent,
    status,
    message,
  }: {
    agent: HookAgent;
    status: HerdrAgentStatus;
    message: string;
  }): Promise<void> => {
    const socket = createConnection(socketPath);
    socket.setEncoding("utf8");
    await connectHerdrReportSocket(socket, connectTimeoutMs);
    const request = {
      id: `hook_report_${++seq}`,
      method: "pane.report_agent",
      params: {
        pane_id: paneId,
        source: "vde-monitor-hook",
        agent,
        state: status,
        message,
        seq: now(),
      },
    };
    await new Promise<void>((resolve, reject) => {
      socket.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error == null) {
          resolve();
          return;
        }
        reject(error);
      });
    });
    if (!socket.destroyed) {
      socket.end();
    }
  };

  return { report };
};

const connectHerdrReportSocket = async (
  socket: HerdrReportSocket,
  timeoutMs: number,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timeout = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error("herdr report timeout"));
    }, timeoutMs);
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
};

export const buildHookEvent = (
  hookEventName: HookEventName,
  rawInput: string,
  fields: HookPayloadFields,
): HookEvent => ({
  ts: new Date().toISOString(),
  hook_event_name: hookEventName,
  notification_type: fields.notificationType,
  session_id: fields.sessionId ?? "",
  cwd: fields.cwd,
  tty: fields.tty,
  tmux_pane: fields.tmuxPane,
  herdr_pane: fields.herdrPane ?? null,
  cmux_surface: fields.cmuxSurface ?? null,
  transcript_path: fields.transcriptPath ?? undefined,
  fallback: buildFallback(fields),
  payload: {
    raw: rawInput,
  },
});

export const buildCodexHookEvent = (
  hookEventName: CodexHookEventName,
  rawInput: string,
  fields: CodexHookPayloadFields,
): CodexHookEvent => ({
  ts: new Date().toISOString(),
  hook_event_name: hookEventName,
  session_id: fields.sessionId ?? "",
  cwd: fields.cwd,
  tty: fields.tty,
  tmux_pane: fields.tmuxPane,
  herdr_pane: fields.herdrPane ?? null,
  cmux_surface: fields.cmuxSurface ?? null,
  transcript_path: fields.transcriptPath ?? undefined,
  fallback: buildFallback(fields),
  payload: {
    raw: rawInput,
  },
});

const appendEvent = (
  event: HookEvent | CodexHookEvent,
  fileName: string,
  env: NodeJS.ProcessEnv = process.env,
  config: HookServerConfig | null = loadConfig(),
): HookServerConfig | null => {
  const serverKey = resolveHookServerKey(config, env);
  const baseDir = path.join(os.homedir(), ".vde-monitor");
  const eventsDir = path.join(baseDir, "events", serverKey);
  const eventsPath = path.join(eventsDir, fileName);
  ensureDir(eventsDir);
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  return config;
};

const reportHerdrHook = async ({
  config,
  agent,
  hookEventName,
  notificationType,
  env,
}: {
  config: HookServerConfig | null;
  agent: HookAgent;
  hookEventName: string;
  notificationType?: ClaudeHookEvent["notification_type"];
  env: NodeJS.ProcessEnv;
}): Promise<void> => {
  if (config?.multiplexerBackend !== "herdr" || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) {
    return;
  }
  const status = deriveHerdrAgentStatus(agent, hookEventName, notificationType);
  if (status == null) {
    return;
  }
  try {
    await createHerdrReporter({
      socketPath: env.HERDR_SOCKET_PATH,
      paneId: env.HERDR_PANE_ID,
    }).report({
      agent,
      status,
      message: `hook:${hookEventName}`,
    });
  } catch {
    // Hook JSONL remains authoritative for vde-monitor; direct herdr reporting is best effort.
  }
};

export { isMainModule };

const main = async () => {
  const parsedArgs = parseHookCliArgs(process.argv.slice(2));
  if (!parsedArgs) {
    console.error("Usage: vde-monitor-hook [codex] <HookEventName>");
    process.exit(1);
  }
  const { agent, hookEventName } = parsedArgs;

  const rawInput = readStdin().trim();
  if (!rawInput) {
    process.exit(0);
  }

  const payload = parsePayload(rawInput);
  if (!payload) {
    console.error("Invalid JSON payload");
    process.exit(1);
  }
  const config = resolveActiveHookConfig(loadConfig(), process.env);
  const extractOptions = { multiplexerBackend: config?.multiplexerBackend };

  if (agent === "codex") {
    if (!shouldPersistCodexHookPayload(payload, hookEventName)) {
      process.exit(0);
    }
    if (!isCodexHookEventName(hookEventName)) {
      process.exit(0);
    }
    const fields = extractCodexPayloadFields(payload, process.env, extractOptions);
    appendEvent(
      buildCodexHookEvent(hookEventName, rawInput, fields),
      "codex.jsonl",
      process.env,
      config,
    );
    await reportHerdrHook({
      config,
      agent,
      hookEventName,
      env: process.env,
    });
    return;
  }

  if (!shouldPersistHookPayload(payload, hookEventName)) {
    process.exit(0);
  }
  if (!isHookEventName(hookEventName)) {
    process.exit(0);
  }

  const fields = extractPayloadFields(payload, process.env, extractOptions);
  const event = buildHookEvent(hookEventName, rawInput, fields);
  appendEvent(event, "claude.jsonl", process.env, config);
  await reportHerdrHook({
    config,
    agent,
    hookEventName,
    notificationType: event.notification_type,
    env: process.env,
  });
};

if (isMainModule(import.meta.url)) {
  main().catch(() => process.exit(1));
}
