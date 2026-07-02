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
};

type PaneState = {
  subscribers: Map<symbol, Subscriber>;
  /** Raw screen text from the last successful capture tick (for dedup). */
  lastScreen: string | null;
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
  return b === "tmux" || b === "wezterm" ? b : "unknown";
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
        : "none";
  const captureMethod: ScreenCaptureMeta["captureMethod"] =
    backend === "tmux" ? "tmux-capture-pane" : backend === "wezterm" ? "wezterm-get-text" : "none";
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
  // tmux uses join-lines; wezterm physical lines are not joined.
  const joinLinesApplied = backend === "tmux";
  const lineCount = config.screen.maxLines;
  const captureMeta = buildTextCaptureMeta(backend, joinLinesApplied);

  const panes = new Map<string, PaneState>();
  let timer: ReturnType<typeof setInterval> | null = null;

  // ---- capture helpers ----

  const doCapture = async (paneId: string) => {
    const detail = monitor.registry.getDetail(paneId);
    if (!detail) return null;
    try {
      return await monitor.getScreenCapture().captureText({
        paneId,
        lines: lineCount,
        joinLines: joinLinesApplied,
        includeAnsi: true,
        includeTruncated: false,
        altScreen: resolveAltScreen(detail.currentCommand, detail.startCommand),
        alternateOn: detail.alternateOn,
        currentCommand: detail.currentCommand ?? detail.startCommand,
      });
    } catch {
      return null;
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
      const result = await doCapture(paneId);
      if (!result) return;
      // Dedup: skip if screen content is unchanged since last tick.
      if (state.lastScreen === result.screen) return;
      state.lastScreen = result.screen;
      // Fan-out: one buildTextResponse per subscriber (each has its own cursor).
      state.subscribers.forEach((subscriber) => {
        deliverToSubscriber(paneId, subscriber, result);
      });
    });
    await Promise.all(captures);
  };

  const ensureTimer = (): void => {
    if (timer !== null) return;
    timer = setInterval(() => {
      tick().catch(() => {});
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
      state = { subscribers: new Map(), lastScreen: null };
      panes.set(paneId, state);
    }

    const id = Symbol();
    const subscriber: Subscriber = { listener, cursor: undefined };
    state.subscribers.set(id, subscriber);
    ensureTimer();

    // Immediate first capture: full response (cursor=undefined → full).
    const capturedState = state; // closure capture for the async callback
    doCapture(paneId)
      .then((result) => {
        if (!result) return;
        // Set lastScreen so the first tick skips sending duplicate data.
        if (capturedState.lastScreen === null) {
          capturedState.lastScreen = result.screen;
        }
        // Always send full for the initial subscriber delivery.
        const response = buildTextResponse({
          paneId,
          lineCount,
          screen: result.screen,
          alternateOn: result.alternateOn,
          truncated: result.truncated,
          captureMeta,
          cursor: undefined,
        });
        subscriber.cursor = response.cursor;
        listener(response);
      })
      .catch(() => {});

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
