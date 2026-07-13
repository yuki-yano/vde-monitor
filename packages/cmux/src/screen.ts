import { type MultiplexerScreenCapture, normalizeLines } from "@vde-monitor/multiplexer";

import { CMUX_METHODS, CMUX_RENDER_METHODS } from "./methods";
import { type CmuxRenderGridTail, renderCmuxRenderGridTail } from "./render-grid";
import { mergeCmuxStyledTail } from "./styled-tail";
import type { CmuxSurfaceWorkspaceIndex } from "./surface-workspace-index";
import type { CmuxRequester } from "./types";

const BATCH_CONCURRENCY = 4;
const COLORED_TAIL_LINES = 600;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CmuxReadTextResult = {
  text?: unknown;
};

type CmuxRenderGridResponse = {
  render_grid?: unknown;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "cmux screen capture failed";

const createSerialExecutor = () => {
  let tail = Promise.resolve();

  return async <T>(task: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release = (): void => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  };
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("cmux screen capture aborted");
};

export const createCmuxScreenCapture = (
  client: CmuxRequester,
  options: { surfaceWorkspaceIndex?: CmuxSurfaceWorkspaceIndex } = {},
): MultiplexerScreenCapture => {
  const runRenderRequest = createSerialExecutor();

  const captureColoredTail = async (
    surfaceId: string,
    signal?: AbortSignal,
  ): Promise<CmuxRenderGridTail | null> => {
    const workspaceId = options.surfaceWorkspaceIndex?.getWorkspaceId(surfaceId);
    if (workspaceId == null) return null;

    return await runRenderRequest(async () => {
      throwIfAborted(signal);
      const requestOptions = signal == null ? undefined : { signal };
      try {
        const scroll = await client.request<CmuxRenderGridResponse>(
          CMUX_RENDER_METHODS.scroll,
          {
            workspace_id: workspaceId,
            surface_id: surfaceId,
            delta_lines: 0,
            max_scrollback_rows: COLORED_TAIL_LINES,
          },
          requestOptions,
        );
        if (scroll.render_grid != null) {
          const rendered = renderCmuxRenderGridTail(scroll.render_grid, {
            expectedSurfaceId: surfaceId,
            maxLines: COLORED_TAIL_LINES,
          });
          return rendered.activeScreen === "primary" ? rendered : null;
        }

        const replay = await client.request<CmuxRenderGridResponse>(
          CMUX_RENDER_METHODS.replay,
          { workspace_id: workspaceId, surface_id: surfaceId },
          requestOptions,
        );
        if (replay.render_grid == null) return null;
        const rendered = renderCmuxRenderGridTail(replay.render_grid, {
          expectedSurfaceId: surfaceId,
          maxLines: COLORED_TAIL_LINES,
        });
        return rendered.activeScreen === "alternate" ? rendered : null;
      } catch {
        throwIfAborted(signal);
        return null;
      }
    });
  };

  const captureText: MultiplexerScreenCapture["captureText"] = async (options, execution) => {
    if (!UUID_PATTERN.test(options.paneId)) {
      throw new Error(`invalid cmux surface id: ${options.paneId}`);
    }
    if (!Number.isSafeInteger(options.lines) || options.lines <= 0) {
      throw new Error(`invalid capture line count: ${options.lines}`);
    }

    const includeTruncated = options.includeTruncated ?? true;
    const requestedLines = options.lines + (includeTruncated ? 1 : 0);
    const result = await client.request<CmuxReadTextResult>(
      CMUX_METHODS.readText,
      {
        surface_id: options.paneId,
        scrollback: true,
        lines: requestedLines,
      },
      execution?.signal == null ? undefined : { signal: execution.signal },
    );
    const text = typeof result.text === "string" ? result.text : "";
    const allLines = normalizeLines(text);
    const truncated = includeTruncated ? allLines.length > options.lines : null;
    const plainVisible = allLines.slice(-options.lines);

    if (options.includeAnsi) {
      const coloredTail = await captureColoredTail(options.paneId, execution?.signal);
      if (coloredTail != null) {
        const merged = mergeCmuxStyledTail({
          plainLines: allLines,
          gridLines: coloredTail.lines,
          maxLines: options.lines,
        });
        if (merged != null) {
          return {
            screen: merged.join("\n"),
            truncated,
            alternateOn: coloredTail.activeScreen === "alternate",
          };
        }
      }
    }

    return {
      screen: plainVisible.join("\n"),
      truncated,
      alternateOn: options.alternateOn,
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
