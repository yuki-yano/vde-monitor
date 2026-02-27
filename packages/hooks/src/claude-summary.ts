import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  PANE_TITLE_MAX,
  type SummaryEffort,
  type SummaryText,
  normalizeSummary,
  parseSummaryOutputFromClaudeJson,
  runSummaryWithClaude,
  runSummaryWithCodex,
  truncateOneLine,
} from "./summary-engine";
import { buildSummaryPromptTemplate } from "./summary-prompt";

export { normalizeSummary, parseSummaryOutputFromClaudeJson, truncateOneLine };
export type { SummaryText };

export type SummarySource = {
  assistantMessage: string | null;
  cwd?: string;
  sessionId?: string;
};

export type ClaudeSummaryEngine = {
  agent: "codex" | "claude";
  model: string;
  effort: SummaryEffort;
};

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_EFFORT: SummaryEffort = "low";
const DEFAULT_TIMEOUT_MS = 12_000;
const TRANSCRIPT_TAIL_MAX_BYTES = 512 * 1024;
const PROMPT_MESSAGE_MAX_CHARS = 4_000;

const SUMMARY_PROMPT = buildSummaryPromptTemplate({
  task: "Claude hook context を要約し、terminal pane title と通知文を作成してください。",
  priorities: [
    "最新の assistant 出力を最優先で使う。",
    "作業の結果・状態・次の待機状況を短く要約する。",
    "push 通知に適した短く明確な表現にする。",
  ],
});

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const readOptionalString = (value: unknown) => (typeof value === "string" ? value : null);

const basenameOrNull = (cwd: string | undefined): string | null => {
  if (!cwd) {
    return null;
  }
  const resolved = path.basename(cwd.trim());
  if (!resolved || resolved === "/" || resolved === ".") {
    return null;
  }
  return resolved;
};

const readTailText = (filePath: string, maxBytes: number): string | null => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) {
      return null;
    }
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      let text = buffer.toString("utf8");
      if (start > 0) {
        const firstNewline = text.indexOf("\n");
        if (firstNewline >= 0) {
          text = text.slice(firstNewline + 1);
        }
      }
      return text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
};

const readObjectProperty = (
  value: unknown,
  key: string,
): Record<string, unknown> | string | unknown[] | null => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return (value as Record<string, unknown>)[key] as
    | Record<string, unknown>
    | string
    | unknown[]
    | null;
};

const collectTextFromContent = (content: unknown): string[] => {
  if (typeof content === "string") {
    const normalized = normalizeWhitespace(content);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  const texts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      const normalized = normalizeWhitespace(item);
      if (normalized) {
        texts.push(normalized);
      }
      continue;
    }
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const type = readOptionalString(record.type);
    const text = readOptionalString(record.text);
    if ((type == null || type === "text") && text) {
      const normalized = normalizeWhitespace(text);
      if (normalized) {
        texts.push(normalized);
      }
    }
  }
  return texts;
};

export const extractAssistantTextFromTranscriptEntry = (entry: unknown): string | null => {
  if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if (readOptionalString(record.type) !== "assistant") {
    return null;
  }

  const message = readObjectProperty(record, "message");
  if (message == null || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  const messageRecord = message as Record<string, unknown>;
  const role = readOptionalString(messageRecord.role);
  if (role != null && role !== "assistant") {
    return null;
  }

  const content = messageRecord.content;
  const texts = collectTextFromContent(content);
  if (texts.length === 0) {
    return null;
  }
  return texts.join("\n");
};

export const extractLatestAssistantMessageFromTranscript = (
  transcriptPath: string | null | undefined,
): string | null => {
  if (!transcriptPath) {
    return null;
  }
  const tailText = readTailText(transcriptPath, TRANSCRIPT_TAIL_MAX_BYTES);
  if (!tailText) {
    return null;
  }

  const lines = tailText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      const text = extractAssistantTextFromTranscriptEntry(parsed);
      if (text) {
        return text;
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const buildFallbackSummary = ({
  assistantMessage,
  cwd,
  sessionId,
}: SummarySource): SummaryText => {
  const cwdLabel = basenameOrNull(cwd);
  const paneCandidate = assistantMessage ?? cwdLabel ?? sessionId ?? "Claude";
  const notificationTitleCandidate = cwdLabel ?? sessionId ?? "タスク完了";
  const notificationBodyCandidate =
    assistantMessage ??
    (cwdLabel ? `${cwdLabel} でタスクが完了しました` : "タスクが完了して入力待ちです");

  return {
    paneTitle: truncateOneLine(paneCandidate, PANE_TITLE_MAX),
    notificationTitle: truncateOneLine(notificationTitleCandidate, NOTIFICATION_TITLE_MAX),
    notificationBody: truncateOneLine(notificationBodyCandidate, NOTIFICATION_BODY_MAX),
  };
};

export const buildSummaryPrompt = ({ assistantMessage, cwd, sessionId }: SummarySource): string => {
  const assistantText =
    assistantMessage == null
      ? "(なし)"
      : assistantMessage.length <= PROMPT_MESSAGE_MAX_CHARS
        ? assistantMessage
        : `${assistantMessage.slice(0, PROMPT_MESSAGE_MAX_CHARS).trimEnd()}\n...(省略)`;
  const cwdLine = cwd ?? "(不明)";
  const sessionLine = sessionId ?? "(不明)";
  return `${SUMMARY_PROMPT}

## Context
- cwd: ${cwdLine}
- session_id: ${sessionLine}

## 最新の assistant 出力
${assistantText}
`;
};

const resolveEngine = (engine: ClaudeSummaryEngine | undefined): ClaudeSummaryEngine => ({
  agent: engine?.agent ?? "claude",
  model: engine?.model ?? DEFAULT_MODEL,
  effort: engine?.effort ?? DEFAULT_EFFORT,
});

export const runClaudeSummary = (
  source: SummarySource,
  options: { engine?: ClaudeSummaryEngine; timeoutMs?: number } = {},
): SummaryText => {
  const fallback = buildFallbackSummary(source);
  const engine = resolveEngine(options.engine);
  const prompt = buildSummaryPrompt(source);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const output =
    engine.agent === "claude"
      ? runSummaryWithClaude({
          prompt,
          model: engine.model,
          effort: engine.effort,
          timeoutMs,
        })
      : runSummaryWithCodex({
          prompt,
          model: engine.model,
          effort: engine.effort,
          timeoutMs,
        });
  return normalizeSummary(output, fallback);
};

export const applyTmuxPaneTitle = (tmuxPane: string | null, paneTitle: string) => {
  if (!tmuxPane || !paneTitle) {
    return;
  }
  spawnSync("tmux", ["select-pane", "-t", tmuxPane, "-T", paneTitle], {
    stdio: "ignore",
  });
};
