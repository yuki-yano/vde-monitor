import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import type { ScreenCaptureMeta, ScreenResponse } from "@vde-monitor/shared";

import { isEditorCommand } from "../monitor/agent-resolver-utils";
import type { createSessionMonitor } from "../monitor";
import type { ScreenCache } from "../screen/screen-cache";

type Monitor = ReturnType<typeof createSessionMonitor>;
type BuildTextResponse = ScreenCache["buildTextResponse"];

type Subscriber = {
  listener: (response: ScreenResponse) => void;
  /** The cursor returned by the last buildTextResponse call for this subscriber. */
  cursor: string | undefined;
  /** Whether this subscriber still needs its initial full response. */
  initialPending: boolean;
};

type PaneState = {
  subscribers: Map<symbol, Subscriber>;
  /** Raw screen text from the last successful capture tick (for dedup). */
  lastScreen: string | null;
  /** Error message from the last failed capture tick (for dedup and recovery detection). */
  lastError: string | null;
};

const TICK_INTERVAL_MS = 1000;

const resolveAltScreen = (
  currentCommand: string | null | undefined,
  startCommand: string | null | undefined,
): "on" | "auto" => {
  if (isEditorCommand(currentCommand) || isEditorCommand(startCommand)) {
    return "on";
  }
  return "auto";
};

const resolveBackend = (config: AgentMonitorConfig): ScreenCaptureMeta["backend"] => {
  const b = config.multiplexer.backend;
  return b === "tmux" || b === "wezterm" || b === "herdr" || b === "cmux" ? b : "unknown";
};

const buildTextCaptureMeta = (
  backend: ScreenCaptureMeta["backend"],
  joinLinesApplied: boolean,
): ScreenCaptureMeta => {
  const lineModel: ScreenCaptureMeta["lineModel"] =
    backend === "tmux"
      ? joinLinesApplied
        ? "joined-physical"
        : "physical"
      : backend === "wezterm"
        ? "physical"
        : backend === "herdr" || backend === "cmux"
          ? "physical"
          : "none";
  const captureMethod: ScreenCaptureMeta["captureMethod"] =
    backend === "tmux"
      ? "tmux-capture-pane"
      : backend === "wezterm"
        ? "wezterm-get-text"
        : backend === "herdr"
          ? "herdr-pane-read"
          : backend === "cmux"
            ? "cmux-read-screen"
            : "none";
  return { backend, lineModel, joinLinesApplied, captureMethod };
};

export const createScreenStreamScheduler = ({
  monitor,
  config,
  buildTextResponse,
}: {
  monitor: Monitor;
  config: AgentMonitorConfig;
  buildTextResponse: BuildTextResponse;
}) => {
  const backend = resolveBackend(config);
  // tmux uses join-lines; wezterm/herdr physical lines are not joined.
  const joinLinesApplied = backend === "tmux";
  const lineCount = config.screen.maxLines;
  const captureMeta = buildTextCaptureMeta(backend, joinLinesApplied);

  const panes = new Map<string, PaneState>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let tickRunning = false;

  // ---- capture helpers ----

  const buildCaptureError = (
    paneId: string,
    code: "INTERNAL" | "INVALID_PANE",
    message: string,
  ): ScreenResponse => ({
    ok: false,
    paneId,
    mode: "text",
    capturedAt: new Date().toISOString(),
    captureMeta,
    error: { code, message },
  });

  const doCapture = async (
    paneId: string,
  ): Promise<
    | {
        ok: true;
        result: { screen: string; alternateOn: boolean; truncated: boolean | null };
      }
    | { ok: false; response: ScreenResponse }
  > => {
    const detail = monitor.registry.getDetail(paneId);
    if (!detail) {
      return {
        ok: false,
        response: buildCaptureError(paneId, "INVALID_PANE", "pane is no longer available"),
      };
    }
    try {
      return {
        ok: true,
        result: await monitor.getScreenCapture("background").captureText({
          paneId,
          lines: lineCount,
          joinLines: joinLinesApplied,
          includeAnsi: true,
          includeTruncated: false,
          altScreen: resolveAltScreen(detail.currentCommand, detail.startCommand),
          alternateOn: detail.alternateOn,
          currentCommand: detail.currentCommand ?? detail.startCommand,
        }),
      };
    } catch {
      return {
        ok: false,
        response: buildCaptureError(paneId, "INTERNAL", "screen capture failed"),
      };
    }
  };

  const deliverToSubscriber = (
    paneId: string,
    subscriber: Subscriber,
    captureResult: { screen: string; alternateOn: boolean; truncated: boolean | null },
  ): void => {
    const response = buildTextResponse({
      paneId,
      lineCount,
      screen: captureResult.screen,
      alternateOn: captureResult.alternateOn,
      truncated: captureResult.truncated,
      captureMeta,
      cursor: subscriber.cursor,
    });
    subscriber.cursor = response.cursor;
    subscriber.listener(response);
  };

  // ---- tick ----

  const tick = async (): Promise<void> => {
    const captures = [...panes.entries()].map(async ([paneId, state]) => {
      if (state.subscribers.size === 0) return;
      const outcome = await doCapture(paneId);
      if (!outcome.ok) {
        const errorMessage = outcome.response.error?.message ?? "screen capture failed";
        const errorChanged = state.lastError !== errorMessage;
        state.lastError = errorMessage;
        state.subscribers.forEach((subscriber) => {
          if (!errorChanged && !subscriber.initialPending) return;
          subscriber.listener(outcome.response);
          subscriber.initialPending = false;
        });
        return;
      }
      const result = outcome.result;
      const screenChanged = state.lastError != null || state.lastScreen !== result.screen;
      state.lastError = null;
      state.lastScreen = result.screen;
      // Fan-out: one buildTextResponse per subscriber (each has its own cursor).
      state.subscribers.forEach((subscriber) => {
        if (!screenChanged && !subscriber.initialPending) return;
        deliverToSubscriber(paneId, subscriber, result);
        subscriber.initialPending = false;
      });
    });
    await Promise.all(captures);
  };

  const runTick = async (): Promise<void> => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      await tick();
    } finally {
      tickRunning = false;
    }
  };

  const ensureTimer = (): void => {
    if (timer !== null) return;
    timer = setInterval(() => {
      runTick().catch(() => {});
    }, TICK_INTERVAL_MS);
  };

  const maybeStopTimer = (): void => {
    for (const state of panes.values()) {
      if (state.subscribers.size > 0) return;
    }
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  // ---- public API ----

  const subscribe = (
    paneId: string,
    listener: (response: ScreenResponse) => void,
  ): (() => void) => {
    let state = panes.get(paneId);
    if (!state) {
      state = { subscribers: new Map(), lastScreen: null, lastError: null };
      panes.set(paneId, state);
    }

    const id = Symbol();
    const subscriber: Subscriber = { listener, cursor: undefined, initialPending: true };
    state.subscribers.set(id, subscriber);
    monitor.markPaneObservationDirty(paneId, "subscriber");
    ensureTimer();

    // Coalesce synchronous subscriptions into one immediate tick. The shared
    // guard also prevents the interval tick from overlapping this capture.
    queueMicrotask(() => {
      runTick().catch(() => {});
    });

    return () => {
      state?.subscribers.delete(id);
      if (state?.subscribers.size === 0) {
        panes.delete(paneId);
      }
      maybeStopTimer();
    };
  };

  const dispose = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    panes.clear();
  };

  return { subscribe, dispose };
};

export type ScreenStreamScheduler = ReturnType<typeof createScreenStreamScheduler>;
