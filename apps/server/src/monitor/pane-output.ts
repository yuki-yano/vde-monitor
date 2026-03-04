import fs from "node:fs/promises";

import { resolveActivityTimestamp } from "../activity-resolver";
import { toErrorMessage } from "../errors";
import {
  type ExternalInputDetectResult,
  detectExternalInputFromLogDelta,
} from "./external-input-detector";
import { type PaneRuntimeState, updateInputAt, updateOutputAt } from "./pane-state";

const DEFAULT_FINGERPRINT_CAPTURE_INTERVAL_MS = 5000;
const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");
const ansiOscPattern = new RegExp(String.raw`\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)`, "g");
const ansiCharsetDesignatePattern = new RegExp(String.raw`\u001b[\(\)\*\+\-\.\/][0-~]`, "g");
const ansiSingleCharacterPattern = new RegExp(String.raw`\u001b(?:[@-Z\\^_]|[=>])`, "g");
const codexQuestionUnansweredLinePattern =
  /^Question\s+\d+\s*\/\s*\d+\s*\(\s*\d+\s+unanswered\s*\)$/i;
const codexQuestionsAnsweredLinePattern = /^Questions\s+\d+\s*\/\s*\d+\s+answered$/i;

type PaneOutputSnapshot = {
  paneId: string;
  paneActivity: number | null;
  windowActivity: number | null;
  paneActive: boolean;
  paneDead: boolean;
  alternateOn: boolean;
};

type PaneOutputDeps = {
  statLogMtime?: (logPath: string) => Promise<string | null>;
  resolveActivityAt?: typeof resolveActivityTimestamp;
  detectExternalInputFromLogDelta?: typeof detectExternalInputFromLogDelta;
  captureFingerprint: (paneId: string, useAlt: boolean) => Promise<string | null>;
  fingerprintIntervalMs?: number;
  allowFingerprintCapture?: boolean;
  now?: () => Date;
};

type UpdatePaneOutputArgs = {
  pane: PaneOutputSnapshot;
  paneState: PaneRuntimeState;
  isAgentPane?: boolean;
  isCodexAgentPane?: boolean;
  logPath: string | null;
  inactiveThresholdMs: number;
  deps: PaneOutputDeps;
};

const defaultStatLogMtime = async (logPath: string) => {
  const stat = await fs.stat(logPath).catch(() => null);
  if (!stat || stat.size <= 0) {
    return null;
  }
  return stat.mtime.toISOString();
};

const createOutputAtTracker = (paneState: PaneRuntimeState) => {
  let outputAt = paneState.lastOutputAt;
  const setOutputAt = (next: string | null) => {
    outputAt = updateOutputAt(paneState, next);
  };
  const getOutputAt = () => outputAt;
  return { setOutputAt, getOutputAt };
};

const updateOutputAtFromLog = async ({
  logPath,
  statLogMtime,
  setOutputAt,
}: {
  logPath: string | null;
  statLogMtime: (logPath: string) => Promise<string | null>;
  setOutputAt: (next: string | null) => void;
}) => {
  if (!logPath) {
    return null;
  }
  const logMtime = await statLogMtime(logPath);
  if (logMtime) {
    setOutputAt(logMtime);
  }
  return logMtime;
};

const updateOutputAtFromActivity = ({
  pane,
  resolveActivityAt,
  setOutputAt,
}: {
  pane: PaneOutputSnapshot;
  resolveActivityAt: typeof resolveActivityTimestamp;
  setOutputAt: (next: string | null) => void;
}) => {
  const activityAt = resolveActivityAt({
    paneId: pane.paneId,
    paneActivity: pane.paneActivity,
  });
  if (activityAt) {
    setOutputAt(activityAt);
  }
  return activityAt;
};

const stripAnsi = (value: string) =>
  value
    .replace(ansiEscapePattern, "")
    .replace(ansiOscPattern, "")
    .replace(ansiCharsetDesignatePattern, "")
    .replace(ansiSingleCharacterPattern, "");

const normalizeQuestionStatusLine = (line: string) =>
  stripAnsi(line)
    .trim()
    .replace(/^[•*-]\s*/, "");

const resolveCodexQuestionPromptActive = (fingerprint: string) => {
  const normalized = stripAnsi(fingerprint.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  const lines = normalized.split("\n");
  let latestStatus: "answered" | "unanswered" | null = null;

  for (const line of lines) {
    const normalizedLine = normalizeQuestionStatusLine(line);
    if (codexQuestionUnansweredLinePattern.test(normalizedLine)) {
      latestStatus = "unanswered";
      continue;
    }
    if (codexQuestionsAnsweredLinePattern.test(normalizedLine)) {
      latestStatus = "answered";
    }
  }

  return latestStatus === "unanswered";
};

const updateOutputAtFromFingerprint = async ({
  pane,
  paneState,
  captureFingerprint,
  now,
  setOutputAt,
  allowCapture,
  trackCodexQuestionPrompt,
}: {
  pane: PaneOutputSnapshot;
  paneState: PaneRuntimeState;
  captureFingerprint: PaneOutputDeps["captureFingerprint"];
  now: () => Date;
  setOutputAt: (next: string | null) => void;
  allowCapture: boolean;
  trackCodexQuestionPrompt: boolean;
}) => {
  if (pane.paneDead || !allowCapture) {
    return;
  }

  const capturedAtMs = now().getTime();
  paneState.lastFingerprintCaptureAtMs = capturedAtMs;
  const fingerprint = await captureFingerprint(pane.paneId, pane.alternateOn);
  if (!fingerprint) {
    return;
  }
  if (trackCodexQuestionPrompt) {
    paneState.codexQuestionPromptActive = resolveCodexQuestionPromptActive(fingerprint);
  }
  if (paneState.lastFingerprint === fingerprint) {
    return;
  }
  paneState.lastFingerprint = fingerprint;
  setOutputAt(new Date(capturedAtMs).toISOString());
};

const ensureFallbackOutputAt = ({
  outputAt,
  inactiveThresholdMs,
  now,
  setOutputAt,
}: {
  outputAt: string | null;
  inactiveThresholdMs: number;
  now: () => Date;
  setOutputAt: (next: string | null) => void;
}) => {
  if (outputAt) {
    return outputAt;
  }
  const fallbackTs = new Date(now().getTime() - inactiveThresholdMs - 1000).toISOString();
  setOutputAt(fallbackTs);
  return fallbackTs;
};

const shouldKeepHookState = (state: string) => state === "WAITING_PERMISSION";

const resolveHookState = (paneState: PaneRuntimeState, outputAt: string | null) => {
  const hookState = paneState.hookState;
  if (!hookState || !outputAt || shouldKeepHookState(hookState.state)) {
    return hookState;
  }
  const hookTs = Date.parse(hookState.at);
  const outputTs = Date.parse(outputAt);
  const hasAdvanced = !Number.isNaN(hookTs) && !Number.isNaN(outputTs) && outputTs > hookTs;
  if (!hasAdvanced) {
    return hookState;
  }
  paneState.hookState = null;
  return null;
};

const applyExternalInputDetection = ({
  pane,
  paneState,
  isAgentPane,
  logPath,
  now,
  detectExternalInput,
}: {
  pane: PaneOutputSnapshot;
  paneState: PaneRuntimeState;
  isAgentPane: boolean;
  logPath: string | null;
  now: () => Date;
  detectExternalInput: typeof detectExternalInputFromLogDelta;
}): Promise<ExternalInputDetectResult> => {
  return detectExternalInput({
    paneId: pane.paneId,
    isAgentPane,
    logPath,
    now,
    previousCursorBytes: paneState.externalInputCursorBytes,
    previousSignature: paneState.externalInputSignature,
  });
};

const updateInputAtFromExternalDetection = ({
  paneState,
  result,
}: {
  paneState: PaneRuntimeState;
  result: ExternalInputDetectResult;
}) => {
  paneState.externalInputCursorBytes = result.nextCursorBytes;
  paneState.externalInputSignature = result.signature;
  paneState.externalInputLastReason = result.reason;
  paneState.externalInputLastReasonCode = result.reasonCode;
  paneState.externalInputLastErrorMessage = result.errorMessage;
  if (result.reason !== "detected" || !result.detectedAt) {
    return null;
  }

  const previousInputAt = paneState.lastInputAt;
  const nextInputAt = updateInputAt(paneState, result.detectedAt);
  if (nextInputAt && nextInputAt !== previousInputAt) {
    paneState.externalInputLastDetectedAt = nextInputAt;
    return nextInputAt;
  }
  return null;
};

export const updatePaneOutputState = async ({
  pane,
  paneState,
  isAgentPane = false,
  isCodexAgentPane = false,
  logPath,
  inactiveThresholdMs,
  deps,
}: UpdatePaneOutputArgs) => {
  const statLogMtime = deps.statLogMtime ?? defaultStatLogMtime;
  const resolveActivityAt = deps.resolveActivityAt ?? resolveActivityTimestamp;
  const detectExternalInput =
    deps.detectExternalInputFromLogDelta ?? detectExternalInputFromLogDelta;
  const fingerprintIntervalMs = Math.max(
    0,
    deps.fingerprintIntervalMs ?? DEFAULT_FINGERPRINT_CAPTURE_INTERVAL_MS,
  );
  const allowFingerprintCapture = deps.allowFingerprintCapture ?? true;
  const now = deps.now ?? (() => new Date());
  if (!isCodexAgentPane) {
    paneState.codexQuestionPromptActive = false;
  }

  const outputAtTracker = createOutputAtTracker(paneState);
  const logMtime = await updateOutputAtFromLog({
    logPath,
    statLogMtime,
    setOutputAt: outputAtTracker.setOutputAt,
  });
  updateOutputAtFromActivity({
    pane,
    resolveActivityAt,
    setOutputAt: outputAtTracker.setOutputAt,
  });
  const lastFingerprintCaptureAtMs = paneState.lastFingerprintCaptureAtMs ?? 0;
  const shouldCaptureFingerprint =
    allowFingerprintCapture &&
    (isCodexAgentPane || !logMtime) &&
    now().getTime() - lastFingerprintCaptureAtMs >= fingerprintIntervalMs;
  await updateOutputAtFromFingerprint({
    pane,
    paneState,
    captureFingerprint: deps.captureFingerprint,
    now,
    setOutputAt: outputAtTracker.setOutputAt,
    allowCapture: shouldCaptureFingerprint,
    trackCodexQuestionPrompt: isCodexAgentPane,
  });

  const outputAt = ensureFallbackOutputAt({
    outputAt: outputAtTracker.getOutputAt(),
    inactiveThresholdMs,
    now,
    setOutputAt: outputAtTracker.setOutputAt,
  });
  const hookState = resolveHookState(paneState, outputAt);
  let inputTouchedAt: string | null = null;
  if (isAgentPane && logPath) {
    const checkedAt = now().toISOString();
    try {
      const detectResult = await applyExternalInputDetection({
        pane,
        paneState,
        isAgentPane,
        logPath,
        now,
        detectExternalInput,
      });
      paneState.externalInputLastCheckedAt = checkedAt;
      inputTouchedAt = updateInputAtFromExternalDetection({
        paneState,
        result: detectResult,
      });
    } catch (error) {
      paneState.externalInputLastCheckedAt = checkedAt;
      paneState.externalInputLastReason = "no-log";
      paneState.externalInputLastReasonCode = "DETECTOR_EXCEPTION";
      paneState.externalInputLastErrorMessage = toErrorMessage(error);
      inputTouchedAt = null;
    }
  }

  return {
    outputAt,
    hookState,
    inputTouchedAt,
    codexQuestionPromptActive: paneState.codexQuestionPromptActive,
  };
};
