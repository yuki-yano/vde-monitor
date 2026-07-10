import { type MultiplexerScreenCapture, normalizeLines } from "@vde-monitor/multiplexer";

import type { WeztermAdapter } from "./adapter";

const BATCH_CONCURRENCY = 4;

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export const createScreenCapture = (adapter: WeztermAdapter): MultiplexerScreenCapture => {
  const captureText: MultiplexerScreenCapture["captureText"] = async (options, execution) => {
    const args = ["get-text", "--pane-id", options.paneId, "--start-line", `-${options.lines}`];
    if (options.includeAnsi) {
      args.push("--escapes");
    }
    const result =
      execution?.signal == null
        ? await adapter.run(args)
        : await adapter.run(args, { signal: execution.signal });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "wezterm get-text failed");
    }
    const allLines = normalizeLines(result.stdout);
    const truncatedFlag = allLines.length > options.lines;
    const visible = truncatedFlag ? allLines.slice(-options.lines) : allLines;
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
