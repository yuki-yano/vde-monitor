import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const DEFAULT_MAX_READ_BYTES = 128 * 1024;
const DEFAULT_MAX_PROMPT_LINES = 24;
const DEFAULT_PROMPT_START_PATTERNS = [/^\s*\u203A(?:\s|$)/, /^\s*>\s/];
const DEFAULT_CONTINUATION_LINE_PATTERN = /^\s+/;

const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");
const ansiOscPattern = new RegExp(String.raw`\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)`, "g");
const ansiCharsetDesignatePattern = new RegExp(String.raw`\u001b[\(\)\*\+\-\.\/][0-~]`, "g");
const ansiSingleCharacterPattern = new RegExp(String.raw`\u001b(?:[@-Z\\^_]|[=>])`, "g");

type ExternalInputDetectReason = "no-log" | "no-growth" | "no-pattern" | "duplicate" | "detected";

type ExternalInputDetectorDeps = {
  statLogSize?: (logPath: string) => Promise<{ size: number } | null>;
  readLogSlice?: (logPath: string, offsetBytes: number, lengthBytes: number) => Promise<string>;
};

export type ExternalInputDetectArgs = {
  paneId: string;
  isAgentPane: boolean;
  logPath: string | null;
  maxReadBytes?: number;
  maxPromptLines?: number;
  now?: () => Date;
  previousCursorBytes: number | null;
  previousSignature: string | null;
  promptStartPatterns?: RegExp[];
  continuationLinePattern?: RegExp;
  deps?: ExternalInputDetectorDeps;
};

export type ExternalInputDetectResult = {
  detectedAt: string | null;
  nextCursorBytes: number | null;
  signature: string | null;
  reason: ExternalInputDetectReason;
};

const normalizeCursorBytes = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
};

const defaultStatLogSize = async (logPath: string) => {
  const stat = await fs.stat(logPath).catch(() => null);
  if (!stat) {
    return null;
  }
  return { size: Math.max(0, Math.floor(stat.size)) };
};

const defaultReadLogSlice = async (logPath: string, offsetBytes: number, lengthBytes: number) => {
  const handle = await fs.open(logPath, "r");
  try {
    const buffer = Buffer.alloc(lengthBytes);
    const { bytesRead } = await handle.read(buffer, 0, lengthBytes, offsetBytes);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close().catch(() => undefined);
  }
};

const stripAnsi = (value: string) =>
  value
    .replace(ansiEscapePattern, "")
    .replace(ansiOscPattern, "")
    .replace(ansiCharsetDesignatePattern, "")
    .replace(ansiSingleCharacterPattern, "");

const normalizeDeltaText = (value: string) =>
  stripAnsi(value.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));

const matchesPromptStart = (line: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(line));

const trimTrailingEmptyLines = (lines: string[]) => {
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last && last.trim().length > 0) {
      return lines;
    }
    lines.pop();
  }
  return lines;
};

const hasPromptContent = (lines: string[]) => {
  if (lines.length === 0) {
    return false;
  }
  const [firstLine, ...rest] = lines;
  const firstPayload = (firstLine ?? "").replace(/^\s*(?:\u203A|>)\s?/, "").trim();
  if (firstPayload.length > 0) {
    return true;
  }
  return rest.some((line) => line.trim().length > 0);
};

const pickLatestPromptBlock = ({
  normalizedText,
  promptStartPatterns,
  continuationLinePattern,
  maxPromptLines,
}: {
  normalizedText: string;
  promptStartPatterns: RegExp[];
  continuationLinePattern: RegExp;
  maxPromptLines: number;
}) => {
  const lines = normalizedText.split("\n");
  let latestBlock: string[] | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!matchesPromptStart(line, promptStartPatterns)) {
      continue;
    }

    const block: string[] = [line];
    let cursor = index + 1;
    while (cursor < lines.length && block.length < maxPromptLines) {
      const nextLine = lines[cursor] ?? "";
      if (matchesPromptStart(nextLine, promptStartPatterns)) {
        break;
      }
      if (nextLine.trim() === "" || continuationLinePattern.test(nextLine)) {
        block.push(nextLine);
        cursor += 1;
        continue;
      }
      break;
    }

    const trimmedBlock = trimTrailingEmptyLines(block);
    if (hasPromptContent(trimmedBlock)) {
      latestBlock = trimmedBlock;
    }
    index = cursor - 1;
  }

  if (!latestBlock || latestBlock.length === 0) {
    return null;
  }
  return latestBlock.join("\n");
};

const buildSignature = ({
  paneId,
  promptBlock,
  readStartBytes,
  nextCursorBytes,
}: {
  paneId: string;
  promptBlock: string;
  readStartBytes: number;
  nextCursorBytes: number;
}) =>
  createHash("sha1")
    .update(paneId)
    .update("\u0000")
    .update(promptBlock)
    .update("\u0000")
    .update(String(readStartBytes))
    .update("\u0000")
    .update(String(nextCursorBytes))
    .digest("hex");

const createResult = ({
  reason,
  detectedAt = null,
  nextCursorBytes,
  signature,
}: {
  reason: ExternalInputDetectReason;
  detectedAt?: string | null;
  nextCursorBytes: number | null;
  signature: string | null;
}): ExternalInputDetectResult => ({
  detectedAt,
  nextCursorBytes,
  signature,
  reason,
});

export const detectExternalInputFromLogDelta = async ({
  paneId,
  isAgentPane,
  logPath,
  maxReadBytes = DEFAULT_MAX_READ_BYTES,
  maxPromptLines = DEFAULT_MAX_PROMPT_LINES,
  now = () => new Date(),
  previousCursorBytes,
  previousSignature,
  promptStartPatterns = DEFAULT_PROMPT_START_PATTERNS,
  continuationLinePattern = DEFAULT_CONTINUATION_LINE_PATTERN,
  deps = {},
}: ExternalInputDetectArgs): Promise<ExternalInputDetectResult> => {
  const previousCursor = normalizeCursorBytes(previousCursorBytes);
  const prevSignature = previousSignature ?? null;

  if (!isAgentPane || !logPath) {
    return createResult({
      reason: "no-log",
      nextCursorBytes: previousCursor,
      signature: prevSignature,
    });
  }

  const statLogSize = deps.statLogSize ?? defaultStatLogSize;
  const readLogSlice = deps.readLogSlice ?? defaultReadLogSlice;
  const safeMaxReadBytes = Math.max(1, Math.floor(maxReadBytes));
  const safeMaxPromptLines = Math.max(1, Math.floor(maxPromptLines));

  try {
    const stat = await statLogSize(logPath);
    if (!stat) {
      return createResult({
        reason: "no-log",
        nextCursorBytes: previousCursor,
        signature: prevSignature,
      });
    }

    const fileSize = Math.max(0, Math.floor(stat.size));
    if (fileSize <= 0) {
      return createResult({
        reason: "no-log",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    if (previousCursor == null) {
      return createResult({
        reason: "no-growth",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    if (fileSize <= previousCursor) {
      return createResult({
        reason: "no-growth",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    let readStartBytes = previousCursor;
    if (fileSize - readStartBytes > safeMaxReadBytes) {
      readStartBytes = fileSize - safeMaxReadBytes;
    }

    const readLengthBytes = fileSize - readStartBytes;
    if (readLengthBytes <= 0) {
      return createResult({
        reason: "no-growth",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    const rawDeltaText = await readLogSlice(logPath, readStartBytes, readLengthBytes);
    const normalizedDeltaText = normalizeDeltaText(rawDeltaText);
    const promptBlock = pickLatestPromptBlock({
      normalizedText: normalizedDeltaText,
      promptStartPatterns,
      continuationLinePattern,
      maxPromptLines: safeMaxPromptLines,
    });

    if (!promptBlock) {
      return createResult({
        reason: "no-pattern",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    const signature = buildSignature({
      paneId,
      promptBlock,
      readStartBytes,
      nextCursorBytes: fileSize,
    });
    if (signature === prevSignature) {
      return createResult({
        reason: "duplicate",
        nextCursorBytes: fileSize,
        signature,
      });
    }

    return createResult({
      reason: "detected",
      detectedAt: now().toISOString(),
      nextCursorBytes: fileSize,
      signature,
    });
  } catch {
    return createResult({
      reason: "no-log",
      nextCursorBytes: previousCursor,
      signature: prevSignature,
    });
  }
};
