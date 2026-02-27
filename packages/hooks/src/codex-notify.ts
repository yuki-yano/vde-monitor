#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
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
import { detectPayloadSourceAgent, readOptionalString, readStringArray } from "./payload-source";
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  PANE_TITLE_MAX,
  type SummaryText,
  normalizeSummary as normalizeSummaryFromOutput,
  runSummaryWithClaude,
  runSummaryWithCodex,
  truncateOneLine,
} from "./summary-engine";
import { buildSummaryPromptTemplate } from "./summary-prompt";
import { appendSummaryEvent, buildSummaryEvent } from "./summary-event";

type CodexNotifyPayload = {
  type?: string;
  cwd?: string;
  "input-messages"?: unknown;
  "last-assistant-message"?: unknown;
  turn_id?: string;
  "turn-id"?: string;
} & Record<string, unknown>;

export type ParsedRuntimeArgs = {
  payloadRaw: string | null;
  forwardCommandArgv: string[];
  showHelp: boolean;
  errorMessage: string | null;
};

const SOURCE_AGENT = "codex" as const;
const SUMMARY_TIMEOUT_BASE_MS = 12_000;

const readStdin = (): string => {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
};

const SUMMARY_PROMPT = buildSummaryPromptTemplate({
  task: "Codex notify payload を要約し、terminal pane title と通知文を作成してください。",
  priorities: [
    '"last-assistant-message" があれば最優先で使う。',
    '必要に応じて "input-messages" の先頭要素を使う。',
    "結果・状態・次の待機状況に絞って短く表現する。",
  ],
});

const basenameOrNull = (cwd: string | null): string | null => {
  if (!cwd) {
    return null;
  }
  const resolved = path.basename(cwd.trim());
  if (!resolved || resolved === "/" || resolved === ".") {
    return null;
  }
  return resolved;
};

export const parseNotifyPayload = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const buildFallbackSummary = (payload: CodexNotifyPayload): SummaryText => {
  const lastAssistantMessage = readOptionalString(payload["last-assistant-message"]);
  const inputMessages = readStringArray(payload["input-messages"]);
  const firstInputMessage = inputMessages[0] ?? null;
  const cwdLabel = basenameOrNull(readOptionalString(payload.cwd));

  const paneCandidate = lastAssistantMessage ?? firstInputMessage ?? cwdLabel ?? "Codex";
  const notificationTitleCandidate =
    firstInputMessage ??
    cwdLabel ??
    (payload.type === "agent-turn-complete" ? "タスク完了" : "Codex");
  const notificationBodyCandidate =
    lastAssistantMessage ??
    firstInputMessage ??
    (cwdLabel ? `${cwdLabel} でタスクが完了しました` : "タスクが完了しました");

  return {
    paneTitle: truncateOneLine(paneCandidate, PANE_TITLE_MAX),
    notificationTitle: truncateOneLine(notificationTitleCandidate, NOTIFICATION_TITLE_MAX),
    notificationBody: truncateOneLine(notificationBodyCandidate, NOTIFICATION_BODY_MAX),
  };
};

export const normalizeSummary = (
  summaryOutput: {
    pane_title?: unknown;
    notification_title?: unknown;
    notification_body?: unknown;
  } | null,
  payload: CodexNotifyPayload,
): SummaryText => normalizeSummaryFromOutput(summaryOutput, buildFallbackSummary(payload));

export const buildSummaryPrompt = (payloadRaw: string) =>
  `${SUMMARY_PROMPT}

## Notify Payload
\`\`\`json
${payloadRaw}
\`\`\`
`;

export const parseRuntimeArgs = (argv: string[]): ParsedRuntimeArgs => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      payloadRaw: null,
      forwardCommandArgv: [],
      showHelp: true,
      errorMessage: null,
    };
  }

  if (argv.length === 0) {
    return {
      payloadRaw: null,
      forwardCommandArgv: [],
      showHelp: false,
      errorMessage: null,
    };
  }

  const payloadRaw = argv.at(-1) ?? null;
  const optionArgs = argv.slice(0, -1).filter((arg) => arg !== "--forward");
  const separatorIndex = optionArgs.indexOf("--");

  if (separatorIndex === -1) {
    if (optionArgs.length > 0) {
      return {
        payloadRaw,
        forwardCommandArgv: [],
        showHelp: false,
        errorMessage: `Unknown arguments: ${optionArgs.join(" ")}`,
      };
    }
    return {
      payloadRaw,
      forwardCommandArgv: [],
      showHelp: false,
      errorMessage: null,
    };
  }

  const argsBeforeSeparator = optionArgs.slice(0, separatorIndex);
  if (argsBeforeSeparator.length > 0) {
    return {
      payloadRaw,
      forwardCommandArgv: [],
      showHelp: false,
      errorMessage: `Unknown arguments before '--': ${argsBeforeSeparator.join(" ")}`,
    };
  }

  const forwardCommandArgv = optionArgs.slice(separatorIndex + 1);
  return {
    payloadRaw,
    forwardCommandArgv,
    showHelp: false,
    errorMessage: null,
  };
};

const resolveTimeoutMs = (waitMs: number) => Math.max(SUMMARY_TIMEOUT_BASE_MS, waitMs + 2000);

const runCodexSummary = (
  payloadRaw: string,
  payload: CodexNotifyPayload,
  sourceConfig: ReturnType<typeof resolveHookSummarySourceConfig>,
  renamePane: boolean,
): SummaryText => {
  const fallback = buildFallbackSummary(payload);
  const output =
    sourceConfig.engine.agent === "codex"
      ? runSummaryWithCodex({
          prompt: buildSummaryPrompt(payloadRaw),
          model: sourceConfig.engine.model,
          effort: sourceConfig.engine.effort,
          timeoutMs: resolveTimeoutMs(sourceConfig.waitMs),
        })
      : runSummaryWithClaude({
          prompt: buildSummaryPrompt(payloadRaw),
          model: sourceConfig.engine.model,
          effort: sourceConfig.engine.effort,
          timeoutMs: resolveTimeoutMs(sourceConfig.waitMs),
        });

  const normalized = normalizeSummaryFromOutput(output, fallback);
  if (renamePane) {
    applyPaneTitle(normalized.paneTitle);
  }
  appendSummaryEvent(
    buildSummaryEvent({
      sourceAgent: "codex",
      sourceEventAt: new Date().toISOString(),
      paneLocator: {
        tmux_pane: readOptionalString(process.env.TMUX_PANE) ?? undefined,
        cwd: readOptionalString(payload.cwd) ?? undefined,
      },
      summary: normalized,
      engine: sourceConfig.engine,
      source: {
        turn_id:
          readOptionalString(payload.turn_id) ??
          readOptionalString(payload["turn-id"]) ??
          undefined,
      },
    }),
  );
  return normalized;
};

const runClaudePayloadSummary = (
  payload: Record<string, unknown>,
  sourceConfig: ReturnType<typeof resolveHookSummarySourceConfig>,
  renamePane: boolean,
): SummaryText => {
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
  if (renamePane) {
    applyTmuxPaneTitle(fields.tmuxPane, summary.paneTitle);
  }
  appendSummaryEvent(
    buildSummaryEvent({
      sourceAgent: "claude",
      sourceEventAt: new Date().toISOString(),
      paneLocator: {
        tmux_pane: fields.tmuxPane ?? undefined,
        tty: fields.tty,
        cwd: fields.cwd,
      },
      summary,
      engine: sourceConfig.engine,
      source: {
        session_id: fields.sessionId,
        hook_event_name: readOptionalString(payload.hook_event_name) ?? undefined,
      },
    }),
  );
  return summary;
};

const applyPaneTitle = (paneTitle: string, env: NodeJS.ProcessEnv = process.env) => {
  const tmuxPane = readOptionalString(env.TMUX_PANE);
  if (!tmuxPane || !paneTitle) {
    return;
  }
  spawnSync("tmux", ["select-pane", "-t", tmuxPane, "-T", paneTitle], {
    stdio: "ignore",
  });
};

const runForwardCommand = (forwardCommandArgv: string[], payloadRaw: string) => {
  if (forwardCommandArgv.length === 0) {
    return;
  }
  const [command, ...args] = forwardCommandArgv;
  if (!command) {
    return;
  }
  spawnSync(command, [...args, payloadRaw], { stdio: "ignore" });
};

const printUsage = () => {
  const usage = [
    "Usage:",
    "  vde-monitor-codex-summary [--forward] [-- <existing-notify-command> ...] <notify-payload-json>",
    "",
    "Examples:",
    '  vde-monitor-codex-summary \'{"type":"agent-turn-complete"}\'',
    '  vde-monitor-codex-summary -- /path/to/current-notify --flag \'{"type":"agent-turn-complete"}\'',
  ];
  console.log(usage.join("\n"));
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

  if (!parsed.payloadRaw) {
    const stdinRaw = readStdin().trim();
    if (!stdinRaw) {
      process.exit(0);
    }
    parsed.payloadRaw = stdinRaw;
  }

  const payload = parseNotifyPayload(parsed.payloadRaw);
  if (!payload) {
    runForwardCommand(parsed.forwardCommandArgv, parsed.payloadRaw);
    process.exit(0);
  }

  const sourceAgent = detectPayloadSourceAgent(payload, SOURCE_AGENT);
  let shouldForward = true;
  if (sourceAgent === "claude") {
    const hookEventName = readOptionalString(payload.hook_event_name) ?? "Stop";
    const isNonInteractivePayload = isClaudeNonInteractivePayload(payload, hookEventName);
    shouldForward = !(hookEventName === "Stop" && isNonInteractivePayload);
  }

  const config = loadConfig();
  const summaryConfig = resolveHookSummaryConfig(config);
  const sourceConfig = resolveHookSummarySourceConfig(config, sourceAgent);
  if (summaryConfig.enabled && sourceConfig.enabled && shouldForward) {
    if (sourceAgent === "claude") {
      runClaudePayloadSummary(payload, sourceConfig, summaryConfig.rename.pane);
    } else {
      runCodexSummary(
        parsed.payloadRaw,
        payload as CodexNotifyPayload,
        sourceConfig,
        summaryConfig.rename.pane,
      );
    }
  }
  if (shouldForward) {
    runForwardCommand(parsed.forwardCommandArgv, parsed.payloadRaw);
  }
};

if (isMainModule()) {
  main();
}

export { truncateOneLine };
