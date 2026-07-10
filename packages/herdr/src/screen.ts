import { type MultiplexerScreenCapture, normalizeLines } from "@vde-monitor/multiplexer";

import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

type HerdrPaneReadResult = {
  read?: {
    text?: unknown;
    truncated?: unknown;
  };
};

const BATCH_CONCURRENCY = 4;

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export const createHerdrScreenCapture = (client: HerdrRequester): MultiplexerScreenCapture => {
  const captureText: MultiplexerScreenCapture["captureText"] = async (options, execution) => {
    const params = {
      pane_id: options.paneId,
      source: "visible",
      lines: options.lines,
      format: options.includeAnsi ? "ansi" : "text",
      strip_ansi: !options.includeAnsi,
    };
    const result =
      execution?.signal == null
        ? await client.request<HerdrPaneReadResult>(HERDR_METHODS.paneRead, params)
        : await client.request<HerdrPaneReadResult>(HERDR_METHODS.paneRead, params, {
            signal: execution.signal,
          });

    const text = typeof result.read?.text === "string" ? result.read.text : "";
    const allLines = normalizeLines(text);
    const truncatedByLineCount = allLines.length > options.lines;
    const visible = truncatedByLineCount ? allLines.slice(-options.lines) : allLines;
    const truncatedFlag = result.read?.truncated === true || truncatedByLineCount;
    const truncated = (options.includeTruncated ?? true) ? truncatedFlag : null;

    return {
      screen: visible.join("\n"),
      truncated,
      alternateOn: false,
    };
  };

  const captureTextBatch: MultiplexerScreenCapture["captureTextBatch"] = async (
    requests,
    execution,
  ) => {
    const results: Awaited<ReturnType<MultiplexerScreenCapture["captureTextBatch"]>> = [];
    results.length = requests.length;
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        const request = requests[index];
        if (request == null) return;
        try {
          results[index] = {
            requestId: request.requestId,
            result: await captureText(request.options, execution),
          };
        } catch (error) {
          results[index] = { requestId: request.requestId, error: getErrorMessage(error) };
        }
      }
    };

    const workerCount = Math.min(requests.length, BATCH_CONCURRENCY);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  };

  return { captureText, captureTextBatch };
};
