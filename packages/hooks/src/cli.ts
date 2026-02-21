#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type AgentMonitorConfigFile,
  configSchema,
  resolveConfigDir,
  resolveMonitorServerKey,
} from "@vde-monitor/shared";
import YAML from "yaml";

type HookPayload = Record<string, unknown>;

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
  multiplexerBackend: "tmux" | "wezterm";
  tmuxSocketName: string | null;
  tmuxSocketPath: string | null;
  weztermTarget: string | null;
};

const CONFIG_FILE_BASENAMES = ["config.yml", "config.yaml", "config.json"] as const;

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

const parseHookServerConfig = (value: unknown): HookServerConfig | null => {
  const parsed = configSchema.safeParse(value);
  if (parsed.success) {
    const config: AgentMonitorConfigFile = parsed.data;
    return {
      multiplexerBackend: config.multiplexer.backend,
      tmuxSocketName: config.tmux.socketName,
      tmuxSocketPath: config.tmux.socketPath,
      weztermTarget: config.multiplexer.wezterm.target,
    };
  }
  return null;
};

const isMissingFileError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "ENOENT" || error.message.includes("ENOENT");
};

const buildReadError = (prefix: string, configPath: string) => {
  return new Error(`${prefix}: ${configPath}`);
};

const resolveConfigPath = () => {
  const configDir = resolveConfigDir();
  let firstNonRegularError: Error | null = null;
  for (const basename of CONFIG_FILE_BASENAMES) {
    const candidatePath = path.join(configDir, basename);
    try {
      const stats = fs.statSync(candidatePath);
      if (stats.isFile()) {
        return candidatePath;
      }
      if (!firstNonRegularError) {
        firstNonRegularError = buildReadError(
          "config path exists but is not a regular file",
          candidatePath,
        );
      }
      continue;
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }
      throw buildReadError("failed to read config", candidatePath);
    }
  }
  if (firstNonRegularError) {
    throw firstNonRegularError;
  }
  return null;
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

  const fields = extractPayloadFields(payload);
  const event = buildHookEvent(hookEventName, rawInput, fields);
  appendEvent(event);
};

if (isMainModule()) {
  main();
}
