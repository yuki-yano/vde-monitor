#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SummaryEngineConfig, SummaryEvent } from "@vde-monitor/shared";

import {
  type SummaryText,
  applyTmuxPaneTitle,
  extractLatestAssistantMessageFromTranscript,
  runClaudeSummary,
} from "./claude-summary";
import {
  extractPayloadFields,
  isClaudeNonInteractivePayload,
  loadConfig,
  resolveHookSummaryConfig,
  resolveHookSummarySourceConfig,
} from "./cli";
import {
  appendSummaryEvent,
  buildSummaryEvent as buildSummaryContractEvent,
} from "./summary-event";
import {
  detectPayloadSourceAgent,
  extractCodexAssistantMessage,
  extractCodexTurnId,
  isLikelyJsonObjectText,
  readOptionalString,
} from "./payload-source";

type HookPayload = Record<string, unknown>;
type HookPayloadFields = ReturnType<typeof extractPayloadFields>;

export type ParsedRuntimeArgs = {
  hookEventName: string | null;
  forwardCommandArgv: string[];
  asyncMode: boolean;
  payloadFilePath: string | null;
  showHelp: boolean;
  errorMessage: string | null;
};

const SOURCE_AGENT = "claude" as const;
const SUMMARY_TIMEOUT_BASE_MS = 12_000;

const readStdin = (): string => {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
};

const resolveTimeoutMs = (waitMs: number) => Math.max(SUMMARY_TIMEOUT_BASE_MS, waitMs + 2000);

export const parseNotifyPayload = (raw: string): HookPayload | null => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as HookPayload;
  } catch {
    return null;
  }
};

export const parseRuntimeArgs = (argv: string[]): ParsedRuntimeArgs => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      hookEventName: null,
      forwardCommandArgv: [],
      asyncMode: false,
      payloadFilePath: null,
      showHelp: true,
      errorMessage: null,
    };
  }

  const separatorIndex = argv.indexOf("--");
  const baseArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  let forwardCommandArgv = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  let hookEventName: string | null = null;
  let asyncMode = false;
  let payloadFilePath: string | null = null;

  for (let index = 0; index < baseArgs.length; index += 1) {
    const arg = baseArgs[index];
    if (!arg) {
      continue;
    }
    if (arg === "--forward") {
      continue;
    }
    if (arg === "--async") {
      asyncMode = true;
      continue;
    }
    if (arg === "--payload-file") {
      const next = baseArgs[index + 1];
      if (!next) {
        return {
          hookEventName,
          forwardCommandArgv: [],
          asyncMode,
          payloadFilePath: null,
          showHelp: false,
          errorMessage: "--payload-file requires a path argument",
        };
      }
      payloadFilePath = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      return {
        hookEventName,
        forwardCommandArgv: [],
        asyncMode,
        payloadFilePath: null,
        showHelp: false,
        errorMessage: `Unknown argument: ${arg}`,
      };
    }
    if (hookEventName == null) {
      hookEventName = arg;
      continue;
    }
    return {
      hookEventName,
      forwardCommandArgv: [],
      asyncMode,
      payloadFilePath: null,
      showHelp: false,
      errorMessage: `Unknown argument: ${arg}`,
    };
  }

  if (!hookEventName) {
    if (payloadFilePath == null && forwardCommandArgv.length > 0) {
      const payloadRaw = forwardCommandArgv.at(-1);
      if (payloadRaw && isLikelyJsonObjectText(payloadRaw)) {
        forwardCommandArgv = forwardCommandArgv.slice(0, -1);
        return {
          hookEventName: payloadRaw,
          forwardCommandArgv,
          asyncMode,
          payloadFilePath: null,
          showHelp: false,
          errorMessage: null,
        };
      }
    }
    return {
      hookEventName: null,
      forwardCommandArgv: [],
      asyncMode,
      payloadFilePath,
      showHelp: false,
      errorMessage: "HookEventName is required",
    };
  }

  return {
    hookEventName,
    forwardCommandArgv,
    asyncMode,
    payloadFilePath,
    showHelp: false,
    errorMessage: null,
  };
};

export const buildSummaryEvent = (
  hookEventName: string,
  fields: HookPayloadFields,
  summary: SummaryText,
  engine: SummaryEngineConfig,
  sourceEventAt = new Date().toISOString(),
): SummaryEvent =>
  buildSummaryContractEvent({
    sourceAgent: SOURCE_AGENT,
    sourceEventAt,
    paneLocator: {
      tmux_pane: fields.tmuxPane ?? undefined,
      tty: fields.tty,
      cwd: fields.cwd,
    },
    summary,
    engine,
    source: {
      session_id: fields.sessionId,
      hook_event_name: hookEventName,
    },
  });

export const buildCodexSummaryEvent = (
  payload: HookPayload,
  summary: SummaryText,
  engine: SummaryEngineConfig,
  sourceEventAt = new Date().toISOString(),
): SummaryEvent =>
  buildSummaryContractEvent({
    sourceAgent: "codex",
    sourceEventAt,
    paneLocator: {
      tmux_pane: readOptionalString(process.env.TMUX_PANE) ?? undefined,
      cwd: readOptionalString(payload.cwd) ?? undefined,
    },
    summary,
    engine,
    source: {
      turn_id: extractCodexTurnId(payload) ?? undefined,
    },
  });

export const shouldForwardHookPayload = (
  hookEventName: string,
  isNonInteractivePayload: boolean,
): boolean => !(hookEventName === "Stop" && isNonInteractivePayload);

export const shouldSkipAsyncSpawnForPayload = (
  hookEventName: string,
  payloadRaw: string,
  options: Parameters<typeof isClaudeNonInteractivePayload>[2] = {},
): boolean => {
  const payload = parseNotifyPayload(payloadRaw.trim());
  if (!payload) {
    return false;
  }
  const isNonInteractivePayload = isClaudeNonInteractivePayload(payload, hookEventName, options);
  return !shouldForwardHookPayload(hookEventName, isNonInteractivePayload);
};

const runForwardCommand = (
  forwardCommandArgv: string[],
  hookEventName: string,
  payloadRaw: string,
) => {
  if (forwardCommandArgv.length === 0) {
    return;
  }
  const [command, ...args] = forwardCommandArgv;
  if (!command) {
    return;
  }
  spawnSync(command, [...args, hookEventName], {
    input: payloadRaw,
    encoding: "utf8",
    stdio: ["pipe", "ignore", "ignore"],
  });
};

const runForwardNotifyCommand = (forwardCommandArgv: string[], payloadRaw: string) => {
  if (forwardCommandArgv.length === 0) {
    return;
  }
  const [command, ...args] = forwardCommandArgv;
  if (!command) {
    return;
  }
  spawnSync(command, [...args, payloadRaw], {
    stdio: "ignore",
  });
};

const printUsage = () => {
  const commandName = path.basename(process.argv[1] ?? "vde-monitor-summary");
  const usage = [
    "Usage:",
    `  ${commandName} [--async] <HookEventName> [--forward] [-- <existing-hook-command> ...]`,
    `  ${commandName} [--async] [--forward] [-- <existing-notify-command> ...] <notify-payload-json>`,
    "",
    "Examples:",
    `  ${commandName} Stop`,
    `  ${commandName} --async Stop`,
    `  ${commandName} --async '{"type":"agent-turn-complete"}'`,
    `  ${commandName} Stop -- vde-monitor-hook`,
  ];
  console.log(usage.join("\n"));
};

const readPayloadFromFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const cleanupPayloadFile = (filePath: string | null) => {
  if (!filePath) {
    return;
  }
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // ignore cleanup errors
  }
  const parentDir = path.dirname(filePath);
  if (!parentDir.startsWith(os.tmpdir())) {
    return;
  }
  try {
    fs.rmdirSync(parentDir);
  } catch {
    // ignore cleanup errors
  }
};

const writePayloadToTempFile = (payloadRaw: string): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-claude-summary-"));
  const payloadFilePath = path.join(tempDir, "payload.json");
  fs.writeFileSync(payloadFilePath, payloadRaw, "utf8");
  return payloadFilePath;
};

export const buildDetachedProcessPlan = (
  parsed: ParsedRuntimeArgs,
  payloadFilePath: string,
  options: { nodeExecPath?: string; mainPath?: string } = {},
) => {
  const mainPath = options.mainPath ?? process.argv[1];
  const nodeExecPath = options.nodeExecPath ?? process.execPath;
  if (!mainPath || !parsed.hookEventName) {
    return null;
  }
  const args = [mainPath, parsed.hookEventName, "--payload-file", payloadFilePath];
  if (parsed.forwardCommandArgv.length > 0) {
    args.push("--", ...parsed.forwardCommandArgv);
  }
  return {
    command: nodeExecPath,
    args,
  };
};

const spawnDetachedProcess = (parsed: ParsedRuntimeArgs, payloadFilePath: string): boolean => {
  const plan = buildDetachedProcessPlan(parsed, payloadFilePath);
  if (!plan) {
    return false;
  }
  try {
    const child = spawn(plan.command, plan.args, {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
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
  const parsed = parseRuntimeArgs(process.argv.slice(2));

  if (parsed.showHelp) {
    printUsage();
    return;
  }

  if (parsed.errorMessage) {
    console.error(parsed.errorMessage);
    process.exit(1);
  }

  if (!parsed.hookEventName) {
    process.exit(1);
  }

  const isPayloadArgMode =
    parsed.hookEventName != null && isLikelyJsonObjectText(parsed.hookEventName);
  const shouldUseDetachedProcessing = parsed.asyncMode && parsed.payloadFilePath == null;
  if (shouldUseDetachedProcessing) {
    const payloadRaw = isPayloadArgMode ? parsed.hookEventName : readStdin();
    if (!payloadRaw.trim()) {
      process.exit(0);
    }

    if (isPayloadArgMode) {
      const payload = parseNotifyPayload(payloadRaw);
      if (payload) {
        const sourceAgent = detectPayloadSourceAgent(payload, SOURCE_AGENT);
        if (sourceAgent === "claude") {
          const hookEventName = readOptionalString(payload.hook_event_name) ?? "Stop";
          const isNonInteractivePayload = isClaudeNonInteractivePayload(payload, hookEventName);
          if (!shouldForwardHookPayload(hookEventName, isNonInteractivePayload)) {
            process.exit(0);
          }
        }
      }
    } else {
      if (!parsed.hookEventName) {
        process.exit(1);
      }
      if (shouldSkipAsyncSpawnForPayload(parsed.hookEventName, payloadRaw)) {
        process.exit(0);
      }
    }

    const payloadFilePath = writePayloadToTempFile(payloadRaw);
    if (!spawnDetachedProcess(parsed, payloadFilePath)) {
      cleanupPayloadFile(payloadFilePath);
      process.exit(1);
    }
    process.exit(0);
  }

  if (isPayloadArgMode) {
    const payloadRaw =
      parsed.payloadFilePath != null
        ? readPayloadFromFile(parsed.payloadFilePath)
        : parsed.hookEventName;
    if (!payloadRaw) {
      process.exit(0);
    }
    const payloadTrimmed = payloadRaw.trim();
    try {
      if (!payloadTrimmed) {
        runForwardNotifyCommand(parsed.forwardCommandArgv, payloadRaw);
        process.exit(0);
      }

      const payload = parseNotifyPayload(payloadTrimmed);
      if (!payload) {
        runForwardNotifyCommand(parsed.forwardCommandArgv, payloadRaw);
        process.exit(0);
      }

      const sourceAgent = detectPayloadSourceAgent(payload, SOURCE_AGENT);
      const config = loadConfig();
      const summaryConfig = resolveHookSummaryConfig(config);
      const sourceConfig = resolveHookSummarySourceConfig(config, sourceAgent);

      if (sourceAgent === "claude") {
        const hookEventName = readOptionalString(payload.hook_event_name) ?? "Stop";
        const isNonInteractivePayload = isClaudeNonInteractivePayload(payload, hookEventName);
        const shouldForward = shouldForwardHookPayload(hookEventName, isNonInteractivePayload);
        if (
          hookEventName === "Stop" &&
          !isNonInteractivePayload &&
          summaryConfig.enabled &&
          sourceConfig.enabled
        ) {
          const fields = extractPayloadFields(payload);
          const assistantMessage = extractLatestAssistantMessageFromTranscript(
            fields.transcriptPath,
          );
          const summary = runClaudeSummary(
            {
              assistantMessage,
              cwd: fields.cwd,
              sessionId: fields.sessionId,
            },
            {
              engine: sourceConfig.engine,
              timeoutMs: resolveTimeoutMs(sourceConfig.waitMs),
            },
          );
          if (summaryConfig.rename.pane) {
            applyTmuxPaneTitle(fields.tmuxPane, summary.paneTitle);
          }
          appendSummaryEvent(
            buildSummaryEvent(
              hookEventName,
              fields,
              summary,
              sourceConfig.engine,
              new Date().toISOString(),
            ),
          );
        }
        if (shouldForward) {
          runForwardNotifyCommand(parsed.forwardCommandArgv, payloadRaw);
        }
        process.exit(0);
      }

      if (summaryConfig.enabled && sourceConfig.enabled) {
        const summary = runClaudeSummary(
          {
            assistantMessage: extractCodexAssistantMessage(payload),
            cwd: readOptionalString(payload.cwd) ?? undefined,
            sessionId: extractCodexTurnId(payload) ?? undefined,
          },
          {
            engine: sourceConfig.engine,
            timeoutMs: resolveTimeoutMs(sourceConfig.waitMs),
          },
        );
        if (summaryConfig.rename.pane) {
          applyTmuxPaneTitle(readOptionalString(process.env.TMUX_PANE), summary.paneTitle);
        }
        appendSummaryEvent(
          buildCodexSummaryEvent(payload, summary, sourceConfig.engine, new Date().toISOString()),
        );
      }
      runForwardNotifyCommand(parsed.forwardCommandArgv, payloadRaw);
      process.exit(0);
    } finally {
      cleanupPayloadFile(parsed.payloadFilePath);
    }
  }

  const payloadRaw =
    parsed.payloadFilePath != null ? readPayloadFromFile(parsed.payloadFilePath) : readStdin();
  const payloadTrimmed = payloadRaw.trim();
  try {
    if (!payloadTrimmed) {
      runForwardCommand(parsed.forwardCommandArgv, parsed.hookEventName, payloadRaw);
      process.exit(0);
    }

    const payload = parseNotifyPayload(payloadTrimmed);
    if (!payload) {
      runForwardCommand(parsed.forwardCommandArgv, parsed.hookEventName, payloadRaw);
      process.exit(0);
    }

    const isNonInteractivePayload = isClaudeNonInteractivePayload(payload, parsed.hookEventName);
    const shouldForward = shouldForwardHookPayload(parsed.hookEventName, isNonInteractivePayload);
    if (parsed.hookEventName === "Stop" && !isNonInteractivePayload) {
      const config = loadConfig();
      const summaryConfig = resolveHookSummaryConfig(config);
      const sourceConfig = resolveHookSummarySourceConfig(config, SOURCE_AGENT);
      if (summaryConfig.enabled && sourceConfig.enabled) {
        const fields = extractPayloadFields(payload);
        const assistantMessage = extractLatestAssistantMessageFromTranscript(fields.transcriptPath);
        const summary = runClaudeSummary(
          {
            assistantMessage,
            cwd: fields.cwd,
            sessionId: fields.sessionId,
          },
          {
            engine: sourceConfig.engine,
            timeoutMs: resolveTimeoutMs(sourceConfig.waitMs),
          },
        );
        if (summaryConfig.rename.pane) {
          applyTmuxPaneTitle(fields.tmuxPane, summary.paneTitle);
        }
        appendSummaryEvent(
          buildSummaryEvent(
            parsed.hookEventName,
            fields,
            summary,
            sourceConfig.engine,
            new Date().toISOString(),
          ),
        );
      }
    }

    if (shouldForward) {
      runForwardCommand(parsed.forwardCommandArgv, parsed.hookEventName, payloadRaw);
    }
  } finally {
    cleanupPayloadFile(parsed.payloadFilePath);
  }
};

if (isMainModule()) {
  main();
}
