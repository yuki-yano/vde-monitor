#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  configDefaults,
  pickUserConfigAllowlist,
  resolveConfigDir,
  resolveConfigFilePath,
  resolveMonitorServerKey,
  userConfigSchema,
} from "@vde-monitor/shared";
import YAML from "yaml";

type HookPayload = Record<string, unknown>;
type ProcessSnapshot = {
  ppid: number;
  command: string;
};

type HookPayloadFields = {
  sessionId?: string;
  cwd?: string;
  tty?: string;
  tmuxPane: string | null;
  notificationType?: string;
  transcriptPath?: string | null;
};

export type HookEvent = {
  ts: string;
  hook_event_name: string;
  notification_type?: string;
  session_id: string;
  cwd?: string;
  tty?: string;
  tmux_pane: string | null;
  transcript_path?: string;
  fallback?: { cwd?: string; transcript_path?: string };
  payload: { raw: string };
};

type HookServerConfig = {
  bind: "127.0.0.1" | "0.0.0.0";
  port: number;
  multiplexerBackend: "tmux" | "wezterm";
  tmuxSocketName: string | null;
  tmuxSocketPath: string | null;
  weztermTarget: string | null;
  summary: {
    enabled: boolean;
    lang: "en" | "ja";
    rename: {
      pane: boolean;
      push: boolean;
    };
    sources: {
      codex: {
        enabled: boolean;
        waitMs: number;
        engine: {
          agent: "codex" | "claude";
          model: string;
          effort: "low" | "medium" | "high";
        };
      };
      claude: {
        enabled: boolean;
        waitMs: number;
        engine: {
          agent: "codex" | "claude";
          model: string;
          effort: "low" | "medium" | "high";
        };
      };
    };
  };
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

const hasAncestorClaudePrintMode = (
  parentPid: number,
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
    if (isClaudeCommand(snapshot.command)) {
      return hasClaudePrintFlag(snapshot.command);
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
  return hasAncestorClaudePrintMode(
    options.parentPid ?? process.ppid,
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

const resolveWithDefault = <T>(value: T | undefined, fallback: T) =>
  typeof value === "undefined" ? fallback : value;

const resolveSummarySource = (
  value:
    | {
        enabled?: boolean;
        waitMs?: number;
        engine?: {
          agent?: "codex" | "claude";
          model?: string;
          effort?: "low" | "medium" | "high";
        };
      }
    | undefined,
  fallback: typeof configDefaults.notifications.summary.sources.codex,
) => ({
  enabled: resolveWithDefault(value?.enabled, fallback.enabled),
  waitMs: resolveWithDefault(value?.waitMs, fallback.waitMs),
  engine: {
    agent: resolveWithDefault(value?.engine?.agent, fallback.engine.agent),
    model: resolveWithDefault(value?.engine?.model, fallback.engine.model),
    effort: resolveWithDefault(value?.engine?.effort, fallback.engine.effort),
  },
});

const resolveSummaryConfig = (
  value:
    | {
        enabled?: boolean;
        lang?: "en" | "ja";
        rename?: { pane?: boolean; push?: boolean };
        sources?: {
          codex?: {
            enabled?: boolean;
            waitMs?: number;
            engine?: {
              agent?: "codex" | "claude";
              model?: string;
              effort?: "low" | "medium" | "high";
            };
          };
          claude?: {
            enabled?: boolean;
            waitMs?: number;
            engine?: {
              agent?: "codex" | "claude";
              model?: string;
              effort?: "low" | "medium" | "high";
            };
          };
        };
      }
    | undefined,
) => {
  const fallback = configDefaults.notifications.summary;
  return {
    enabled: resolveWithDefault(value?.enabled, fallback.enabled),
    lang: resolveWithDefault(value?.lang, fallback.lang),
    rename: {
      pane: resolveWithDefault(value?.rename?.pane, fallback.rename.pane),
      push: resolveWithDefault(value?.rename?.push, fallback.rename.push),
    },
    sources: {
      codex: resolveSummarySource(value?.sources?.codex, fallback.sources.codex),
      claude: resolveSummarySource(value?.sources?.claude, fallback.sources.claude),
    },
  };
};

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
      summary: resolveSummaryConfig(config.notifications?.summary),
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

export const resolveHookServerKey = (config: HookServerConfig | null): string => {
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
  });
};

export const resolveHookSummaryConfig = (config: HookServerConfig | null) =>
  config?.summary ?? configDefaults.notifications.summary;

export const resolveHookSummarySourceConfig = (
  config: HookServerConfig | null,
  sourceAgent: "codex" | "claude",
) => resolveHookSummaryConfig(config).sources[sourceAgent];

const parsePayload = (rawInput: string): HookPayload | null => {
  try {
    return JSON.parse(rawInput) as HookPayload;
  } catch {
    return null;
  }
};

export const extractPayloadFields = (
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): HookPayloadFields => {
  const sessionId = toOptionalString(payload.session_id);
  const cwd = toOptionalString(payload.cwd);
  const transcriptPath =
    toOptionalString(payload.transcript_path) ?? resolveTranscriptPath(cwd, sessionId);
  return {
    sessionId,
    cwd,
    tty: toOptionalString(payload.tty),
    tmuxPane: toOptionalString(payload.tmux_pane) ?? env.TMUX_PANE ?? null,
    notificationType: toOptionalString(payload.notification_type),
    transcriptPath,
  };
};

const buildFallback = (fields: HookPayloadFields): HookEvent["fallback"] => {
  if (fields.tmuxPane != null) {
    return undefined;
  }
  return {
    cwd: fields.cwd,
    transcript_path: fields.transcriptPath ?? undefined,
  };
};

export const buildHookEvent = (
  hookEventName: string,
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
  transcript_path: fields.transcriptPath ?? undefined,
  fallback: buildFallback(fields),
  payload: {
    raw: rawInput,
  },
});

const appendEvent = (event: HookEvent) => {
  const config = loadConfig();
  const serverKey = resolveHookServerKey(config);
  const baseDir = path.join(os.homedir(), ".vde-monitor");
  const eventsDir = path.join(baseDir, "events", serverKey);
  const eventsPath = path.join(eventsDir, "claude.jsonl");
  ensureDir(eventsDir);
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
};

const toCanonicalFileUrlFromPath = (targetPath: string) => {
  try {
    return pathToFileURL(fs.realpathSync(targetPath)).href;
  } catch {
    return pathToFileURL(path.resolve(targetPath)).href;
  }
};

const toCanonicalFileUrlFromModuleUrl = (moduleUrl: string) => {
  if (!moduleUrl.startsWith("file:")) {
    return moduleUrl;
  }
  try {
    return pathToFileURL(fs.realpathSync(fileURLToPath(moduleUrl))).href;
  } catch {
    try {
      return pathToFileURL(fileURLToPath(moduleUrl)).href;
    } catch {
      return moduleUrl;
    }
  }
};

export const isMainModule = (
  mainPath: string | undefined = process.argv[1],
  moduleUrl = import.meta.url,
) => {
  if (!mainPath) {
    return false;
  }
  return toCanonicalFileUrlFromModuleUrl(moduleUrl) === toCanonicalFileUrlFromPath(mainPath);
};

const main = () => {
  const hookEventName = process.argv[2];
  if (!hookEventName) {
    console.error("Usage: vde-monitor-hook <HookEventName>");
    process.exit(1);
  }

  const rawInput = readStdin().trim();
  if (!rawInput) {
    process.exit(0);
  }

  const payload = parsePayload(rawInput);
  if (!payload) {
    console.error("Invalid JSON payload");
    process.exit(1);
  }
  if (!shouldPersistHookPayload(payload, hookEventName)) {
    process.exit(0);
  }

  const fields = extractPayloadFields(payload);
  const event = buildHookEvent(hookEventName, rawInput, fields);
  appendEvent(event);
};

if (isMainModule()) {
  main();
}
