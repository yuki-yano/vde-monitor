import { randomUUID } from "node:crypto";

import {
  type MultiplexerScreenCapture,
  type TextCaptureBatchRequest,
  type TextCaptureBatchResult,
  normalizeScreen,
} from "@vde-monitor/multiplexer";
import { type TextCaptureOptions, isEditorCommand } from "@vde-monitor/shared";

import type { TmuxAdapter } from "./adapter";

const TMUX_PANE_ID_PATTERN = /^%\d+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TMUX_BATCH_DELIMITER_PREFIX = "__VDE_MONITOR_CAPTURE_V1";

export type TmuxCaptureDelimiters = {
  start: string;
  captureOk: string;
  sizeStart: string;
  sizeOk: string;
  end: string;
};

export type TmuxCaptureBatchPlan = {
  requestId: string;
  options: TextCaptureOptions;
  delimiters: TmuxCaptureDelimiters;
};

type ScreenCaptureDeps = {
  createRequestToken?: () => string;
};

type PreparedBatchItem =
  | { kind: "valid"; plan: TmuxCaptureBatchPlan }
  | { kind: "error"; requestId: string; error: string };

const shouldUsePrimaryBuffer = (command?: string | null): boolean => isEditorCommand(command);

const resolveAltFlag = (altScreen: "auto" | "on" | "off", alternateOn: boolean): boolean => {
  if (altScreen === "on") return true;
  if (altScreen === "off") return false;
  return alternateOn;
};

export const createTmuxCaptureDelimiters = (token: string): TmuxCaptureDelimiters => {
  if (!UUID_PATTERN.test(token)) {
    throw new Error("invalid tmux capture delimiter token");
  }
  return {
    start: `${TMUX_BATCH_DELIMITER_PREFIX}_${token}_START`,
    captureOk: `${TMUX_BATCH_DELIMITER_PREFIX}_${token}_CAPTURE_OK`,
    sizeStart: `${TMUX_BATCH_DELIMITER_PREFIX}_${token}_SIZE_START`,
    sizeOk: `${TMUX_BATCH_DELIMITER_PREFIX}_${token}_SIZE_OK`,
    end: `${TMUX_BATCH_DELIMITER_PREFIX}_${token}_END`,
  };
};

const validateCaptureOptions = (options: TextCaptureOptions): string | null => {
  if (!TMUX_PANE_ID_PATTERN.test(options.paneId)) {
    return `invalid tmux pane id: ${options.paneId}`;
  }
  if (!Number.isSafeInteger(options.lines) || options.lines <= 0) {
    return `invalid capture line count: ${options.lines}`;
  }
  return null;
};

const appendTmuxCommand = (args: string[], command: string[]): void => {
  if (args.length > 0) args.push(";");
  args.push(...command);
};

const buildCaptureCommandList = (plan: TmuxCaptureBatchPlan): string => {
  const { options, delimiters } = plan;
  const useAlt =
    resolveAltFlag(options.altScreen, options.alternateOn) &&
    !shouldUsePrimaryBuffer(options.currentCommand);
  const command = ["capture-pane", "-p", "-t", options.paneId];
  if (options.joinLines) command.push("-J");
  if (options.includeAnsi) command.push("-e");
  if (useAlt) command.push("-a");
  command.push("-S", `-${options.lines}`, "-E", "-");
  command.push(";", "display-message", "-p", delimiters.captureOk);
  return command.join(" ");
};

const buildSizeCommandList = (plan: TmuxCaptureBatchPlan): string =>
  [
    "display-message",
    "-p",
    "-t",
    plan.options.paneId,
    "'#{history_size},#{pane_height}'",
    ";",
    "display-message",
    "-p",
    plan.delimiters.sizeOk,
  ].join(" ");

export const buildTmuxCaptureBatchArgs = (plans: TmuxCaptureBatchPlan[]): string[] => {
  const args: string[] = [];
  for (const plan of plans) {
    const optionsError = validateCaptureOptions(plan.options);
    if (optionsError != null) {
      throw new Error(optionsError);
    }
    const token = plan.delimiters.start.slice(
      `${TMUX_BATCH_DELIMITER_PREFIX}_`.length,
      -"_START".length,
    );
    const expectedDelimiters = createTmuxCaptureDelimiters(token);
    if (
      Object.entries(expectedDelimiters).some(
        ([key, value]) => plan.delimiters[key as keyof TmuxCaptureDelimiters] !== value,
      )
    ) {
      throw new Error("invalid tmux capture delimiter set");
    }
    appendTmuxCommand(args, ["display-message", "-p", plan.delimiters.start]);
    appendTmuxCommand(args, ["if-shell", "-F", "1", buildCaptureCommandList(plan)]);
    appendTmuxCommand(args, ["display-message", "-p", plan.delimiters.sizeStart]);
    if (plan.options.includeTruncated ?? true) {
      appendTmuxCommand(args, ["if-shell", "-F", "1", buildSizeCommandList(plan)]);
    }
    appendTmuxCommand(args, ["display-message", "-p", plan.delimiters.end]);
  }
  return args;
};

const findExactLine = (
  lines: string[],
  expected: string,
  fromIndex: number,
  throughIndex = lines.length,
): number => {
  for (let index = fromIndex; index < throughIndex; index += 1) {
    if (lines[index] === expected) return index;
  }
  return -1;
};

const parsePaneSize = (lines: string[]): { historySize: number; paneHeight: number } | null => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^(\d+),(\d+)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const historySize = Number.parseInt(match[1] ?? "", 10);
    const paneHeight = Number.parseInt(match[2] ?? "", 10);
    if (Number.isSafeInteger(historySize) && Number.isSafeInteger(paneHeight)) {
      return { historySize, paneHeight };
    }
  }
  return null;
};

export const parseTmuxCaptureBatchOutput = ({
  stdout,
  stderr,
  plans,
}: {
  stdout: string;
  stderr: string;
  plans: TmuxCaptureBatchPlan[];
}): TextCaptureBatchResult[] => {
  const lines = stdout.replaceAll("\r\n", "\n").split("\n");
  let cursor = 0;
  return plans.map((plan) => {
    const { delimiters, options, requestId } = plan;
    const startIndex = findExactLine(lines, delimiters.start, cursor);
    if (startIndex < 0) {
      return { requestId, error: "tmux capture start delimiter missing" };
    }
    const sizeStartIndex = findExactLine(lines, delimiters.sizeStart, startIndex + 1);
    const endIndex =
      sizeStartIndex < 0 ? -1 : findExactLine(lines, delimiters.end, sizeStartIndex + 1);
    if (sizeStartIndex < 0 || endIndex < 0) {
      return { requestId, error: "tmux capture delimiter missing" };
    }
    cursor = endIndex + 1;

    const captureOkIndex = findExactLine(
      lines,
      delimiters.captureOk,
      startIndex + 1,
      sizeStartIndex,
    );
    if (captureOkIndex < 0) {
      return { requestId, error: stderr.trim() || "tmux capture-pane failed" };
    }

    let truncated: boolean | null = null;
    if (options.includeTruncated ?? true) {
      const sizeOkIndex = findExactLine(lines, delimiters.sizeOk, sizeStartIndex + 1, endIndex);
      if (sizeOkIndex >= 0) {
        const paneSize = parsePaneSize(lines.slice(sizeStartIndex + 1, sizeOkIndex));
        truncated =
          paneSize == null ? null : paneSize.historySize + paneSize.paneHeight > options.lines;
      }
    }

    const screen = lines.slice(startIndex + 1, captureOkIndex).join("\n");
    return {
      requestId,
      result: {
        screen: normalizeScreen(screen, options.lines),
        truncated,
        alternateOn: options.alternateOn,
      },
    };
  });
};

export const createScreenCapture = (
  adapter: TmuxAdapter,
  deps: ScreenCaptureDeps = {},
): MultiplexerScreenCapture => {
  const createRequestToken = deps.createRequestToken ?? randomUUID;

  const captureTextBatch: MultiplexerScreenCapture["captureTextBatch"] = async (
    requests,
    execution,
  ) => {
    const prepared: PreparedBatchItem[] = requests.map((request) => {
      const error = validateCaptureOptions(request.options);
      if (error != null) {
        return { kind: "error", error, requestId: request.requestId };
      }
      const token = createRequestToken();
      if (!UUID_PATTERN.test(token)) {
        return {
          kind: "error",
          error: "invalid tmux capture delimiter token",
          requestId: request.requestId,
        };
      }
      return {
        kind: "valid",
        plan: {
          requestId: request.requestId,
          options: request.options,
          delimiters: createTmuxCaptureDelimiters(token),
        } satisfies TmuxCaptureBatchPlan,
      };
    });
    const plans = prepared.flatMap((item) => (item.kind === "valid" ? [item.plan] : []));
    if (plans.length === 0) {
      return prepared.map((item) =>
        item.kind === "error"
          ? { requestId: item.requestId, error: item.error }
          : { requestId: item.plan.requestId, error: "tmux capture failed" },
      );
    }

    const args = buildTmuxCaptureBatchArgs(plans);
    const adapterResult = await adapter.run(
      args,
      execution?.signal == null ? undefined : { signal: execution.signal },
    );
    const parsed = parseTmuxCaptureBatchOutput({
      stdout: adapterResult.stdout,
      stderr: adapterResult.stderr,
      plans,
    });
    let parsedIndex = 0;
    const results: TextCaptureBatchResult[] = [];
    for (const item of prepared) {
      if (item.kind === "valid") {
        results.push(
          parsed[parsedIndex] ?? {
            requestId: item.plan.requestId,
            error: "tmux capture result missing",
          },
        );
        parsedIndex += 1;
      } else {
        results.push({ requestId: item.requestId, error: item.error });
      }
    }
    return results;
  };

  const captureText: MultiplexerScreenCapture["captureText"] = async (options, execution) => {
    const request: TextCaptureBatchRequest = { requestId: "single", options };
    const [captured] = await captureTextBatch([request], execution);
    if (captured?.result != null) return captured.result;
    throw new Error(captured?.error ?? "tmux capture failed");
  };

  return { captureText, captureTextBatch };
};
