import { createHash } from "node:crypto";
import fs from "node:fs/promises";

import {
  collectPromptBlockRanges,
  getPromptStartPatterns,
  stripPromptStartMarker,
} from "@vde-monitor/shared";

const DEFAULT_MAX_READ_BYTES = 128 * 1024;
const DEFAULT_MAX_PROMPT_LINES = 24;
const CLAMP_OVERLAP_BYTES = 4;
const DEFAULT_PROMPT_START_PATTERNS = getPromptStartPatterns("agent");
const replacementCharPattern = /^\uFFFD+/;

const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");
const ansiOscPattern = new RegExp(String.raw`\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)`, "g");
const ansiCharsetDesignatePattern = new RegExp(String.raw`\u001b[\(\)\*\+\-\.\/][0-~]`, "g");
const ansiSingleCharacterPattern = new RegExp(String.raw`\u001b(?:[@-Z\\^_]|[=>])`, "g");

export type ExternalInputDetectReason =
  | "no-log"
  | "no-growth"
  | "no-pattern"
  | "duplicate"
  | "detected";
export type ExternalInputDetectReasonCode =
  | "SKIP_NON_AGENT_OR_NO_LOG"
  | "LOG_STAT_UNAVAILABLE"
  | "LOG_EMPTY"
  | "FIRST_CURSOR_SYNC"
  | "NO_LOG_GROWTH"
  | "DELTA_READ_ERROR"
  | "NO_PROMPT_PATTERN"
  | "DUPLICATE_PROMPT_SIGNATURE"
  | "PROMPT_DETECTED"
  | "DETECTOR_EXCEPTION";

type ExternalInputDetectorDeps = {
  statLogSize?: (logPath: string) => Promise<{ size: number } | null>;
  readLogSlice?: (logPath: string, offsetBytes: number, lengthBytes: number) => Promise<string>;
};

type DeltaSegment = {
  startBytes: number;
  lengthBytes: number;
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
  promptStartPatterns?: readonly RegExp[];
  deps?: ExternalInputDetectorDeps;
};

export type ExternalInputDetectResult = {
  detectedAt: string | null;
  nextCursorBytes: number | null;
  signature: string | null;
  reason: ExternalInputDetectReason;
  reasonCode: ExternalInputDetectReasonCode;
  errorMessage: string | null;
};

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "unknown error";
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

const matchesPromptStart = (line: string, patterns: readonly RegExp[]) =>
  patterns.some((pattern) => pattern.test(line));

const normalizeClampedLeadingLine = (text: string, promptStartPatterns: readonly RegExp[]) => {
  const lines = text.split("\n");
  if (lines.length === 0) {
    return text;
  }

  const firstLine = lines[0] ?? "";
  const normalizedFirstLine = firstLine.replace(replacementCharPattern, "");
  if (normalizedFirstLine !== firstLine) {
    if (matchesPromptStart(normalizedFirstLine, promptStartPatterns)) {
      lines[0] = normalizedFirstLine;
      return lines.join("\n");
    }
    lines.shift();
    return lines.join("\n");
  }
  return lines.join("\n");
};

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
  const firstPayload = stripPromptStartMarker(firstLine ?? "", "agent").trim();
  if (firstPayload.length > 0) {
    return true;
  }
  return rest.some((line) => line.trim().length > 0);
};

const pickLatestPromptBlock = ({
  normalizedText,
  promptStartPatterns,
  maxPromptLines,
}: {
  normalizedText: string;
  promptStartPatterns: readonly RegExp[];
  maxPromptLines: number;
}) => {
  const lines = normalizedText.split("\n");
  const promptBlockRanges = collectPromptBlockRanges({
    lines,
    isPromptStart: (line) => matchesPromptStart(line, promptStartPatterns),
  });
  let latestBlock: string[] | null = null;

  for (const { start, endExclusive } of promptBlockRanges) {
    const limitedEndExclusive = Math.min(endExclusive, start + maxPromptLines);
    const block = lines.slice(start, limitedEndExclusive);
    const trimmedBlock = trimTrailingEmptyLines(block);
    if (hasPromptContent(trimmedBlock)) {
      latestBlock = trimmedBlock;
    }
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
  reasonCode,
  detectedAt = null,
  nextCursorBytes,
  signature,
  errorMessage = null,
}: {
  reason: ExternalInputDetectReason;
  reasonCode: ExternalInputDetectReasonCode;
  detectedAt?: string | null;
  nextCursorBytes: number | null;
  signature: string | null;
  errorMessage?: string | null;
}): ExternalInputDetectResult => ({
  detectedAt,
  nextCursorBytes,
  signature,
  reason,
  reasonCode,
  errorMessage,
});

const resolveReadSegments = ({
  previousCursor,
  fileSize,
  maxReadBytes,
}: {
  previousCursor: number;
  fileSize: number;
  maxReadBytes: number;
}): DeltaSegment[] => {
  const deltaBytes = fileSize - previousCursor;
  if (deltaBytes <= maxReadBytes) {
    return [{ startBytes: previousCursor, lengthBytes: deltaBytes }];
  }

  const headSegment: DeltaSegment = {
    startBytes: previousCursor,
    lengthBytes: maxReadBytes,
  };
  const tailStartBytes = Math.max(previousCursor, fileSize - maxReadBytes - CLAMP_OVERLAP_BYTES);
  const tailSegment: DeltaSegment = {
    startBytes: tailStartBytes,
    lengthBytes: fileSize - tailStartBytes,
  };

  const headEndBytes = headSegment.startBytes + headSegment.lengthBytes;
  if (tailSegment.startBytes <= headEndBytes) {
    return [{ startBytes: previousCursor, lengthBytes: deltaBytes }];
  }
  return [headSegment, tailSegment];
};

const detectPromptFromSegment = async ({
  paneId,
  logPath,
  segment,
  fileSize,
  maxPromptLines,
  prevSignature,
  promptStartPatterns,
  readLogSlice,
}: {
  paneId: string;
  logPath: string;
  segment: DeltaSegment;
  fileSize: number;
  maxPromptLines: number;
  prevSignature: string | null;
  promptStartPatterns: readonly RegExp[];
  readLogSlice: (logPath: string, offsetBytes: number, lengthBytes: number) => Promise<string>;
}) => {
  if (segment.lengthBytes <= 0) {
    return { matched: false as const, duplicate: false as const, signature: prevSignature };
  }

  const rawDeltaText = await readLogSlice(logPath, segment.startBytes, segment.lengthBytes);
  const normalizedDeltaText = normalizeDeltaText(rawDeltaText);
  const scanText =
    segment.startBytes > 0
      ? normalizeClampedLeadingLine(normalizedDeltaText, promptStartPatterns)
      : normalizedDeltaText;
  const promptBlock = pickLatestPromptBlock({
    normalizedText: scanText,
    promptStartPatterns,
    maxPromptLines,
  });
  if (!promptBlock) {
    return { matched: false as const, duplicate: false as const, signature: prevSignature };
  }

  const signature = buildSignature({
    paneId,
    promptBlock,
    readStartBytes: segment.startBytes,
    nextCursorBytes: fileSize,
  });
  if (signature === prevSignature) {
    return { matched: true as const, duplicate: true as const, signature };
  }
  return { matched: true as const, duplicate: false as const, signature };
};

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
  deps = {},
}: ExternalInputDetectArgs): Promise<ExternalInputDetectResult> => {
  const previousCursor = normalizeCursorBytes(previousCursorBytes);
  const prevSignature = previousSignature ?? null;

  if (!isAgentPane || !logPath) {
    return createResult({
      reason: "no-log",
      reasonCode: "SKIP_NON_AGENT_OR_NO_LOG",
      nextCursorBytes: previousCursor,
      signature: prevSignature,
    });
  }

  const statLogSize = deps.statLogSize ?? defaultStatLogSize;
  const readLogSlice = deps.readLogSlice ?? defaultReadLogSlice;
  const normalizedMaxReadBytes = Number.isFinite(maxReadBytes)
    ? maxReadBytes
    : DEFAULT_MAX_READ_BYTES;
  const normalizedMaxPromptLines = Number.isFinite(maxPromptLines)
    ? maxPromptLines
    : DEFAULT_MAX_PROMPT_LINES;
  const safeMaxReadBytes = Math.max(1, Math.floor(normalizedMaxReadBytes));
  const safeMaxPromptLines = Math.max(1, Math.floor(normalizedMaxPromptLines));

  try {
    const stat = await statLogSize(logPath);
    if (!stat) {
      return createResult({
        reason: "no-log",
        reasonCode: "LOG_STAT_UNAVAILABLE",
        nextCursorBytes: previousCursor,
        signature: prevSignature,
      });
    }

    const fileSize = Math.max(0, Math.floor(stat.size));
    if (fileSize <= 0) {
      return createResult({
        reason: "no-log",
        reasonCode: "LOG_EMPTY",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    if (previousCursor == null) {
      return createResult({
        reason: "no-growth",
        reasonCode: "FIRST_CURSOR_SYNC",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    if (fileSize <= previousCursor) {
      return createResult({
        reason: "no-growth",
        reasonCode: "NO_LOG_GROWTH",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    const segments = resolveReadSegments({
      previousCursor,
      fileSize,
      maxReadBytes: safeMaxReadBytes,
    });
    if (segments.length === 0) {
      return createResult({
        reason: "no-growth",
        reasonCode: "NO_LOG_GROWTH",
        nextCursorBytes: fileSize,
        signature: prevSignature,
      });
    }

    let duplicateSignature: string | null = null;
    for (const segment of segments) {
      const segmentResult = await detectPromptFromSegment({
        paneId,
        logPath,
        segment,
        fileSize,
        maxPromptLines: safeMaxPromptLines,
        prevSignature,
        promptStartPatterns,
        readLogSlice,
      }).catch((error: unknown) => {
        return {
          error,
          matched: false as const,
          duplicate: false as const,
          signature: prevSignature,
        };
      });
      if ("error" in segmentResult) {
        return createResult({
          reason: "no-log",
          reasonCode: "DELTA_READ_ERROR",
          nextCursorBytes: previousCursor,
          signature: prevSignature,
          errorMessage: resolveErrorMessage(segmentResult.error),
        });
      }
      if (!segmentResult.matched) {
        continue;
      }
      if (segmentResult.duplicate) {
        duplicateSignature = segmentResult.signature;
        continue;
      }
      return createResult({
        reason: "detected",
        reasonCode: "PROMPT_DETECTED",
        detectedAt: now().toISOString(),
        nextCursorBytes: fileSize,
        signature: segmentResult.signature,
      });
    }

    if (duplicateSignature) {
      return createResult({
        reason: "duplicate",
        reasonCode: "DUPLICATE_PROMPT_SIGNATURE",
        nextCursorBytes: fileSize,
        signature: duplicateSignature,
      });
    }
    return createResult({
      reason: "no-pattern",
      reasonCode: "NO_PROMPT_PATTERN",
      nextCursorBytes: fileSize,
      signature: prevSignature,
    });
  } catch (error) {
    return createResult({
      reason: "no-log",
      reasonCode: "DETECTOR_EXCEPTION",
      nextCursorBytes: previousCursor,
      signature: prevSignature,
      errorMessage: resolveErrorMessage(error),
    });
  }
};
