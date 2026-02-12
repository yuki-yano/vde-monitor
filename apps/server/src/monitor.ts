import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type AgentMonitorConfig, type SessionStateTimelineRange } from "@vde-monitor/shared";

import { createJsonlTailer, createLogActivityPoller, ensureDir } from "./logs";
import { handleHookLine, type HookEventContext } from "./monitor/hook-tailer";
import { createMonitorLoop } from "./monitor/loop";
import {
  createRestoredSessionApplier,
  restoreMonitorRuntimeState,
} from "./monitor/monitor-persistence";
import { createPaneLogManager } from "./monitor/pane-log-manager";
import { createPaneStateStore } from "./monitor/pane-state";
import { createPaneUpdateService } from "./monitor/pane-update-service";
import type { MultiplexerRuntime } from "./multiplexer/types";
import { createSessionRegistry } from "./session-registry";
import { restoreSessions, restoreTimeline, saveState } from "./state-store";
import { createSessionTimelineStore } from "./state-timeline/store";

const baseDir = path.join(os.homedir(), ".vde-monitor");

export const createSessionMonitor = (runtime: MultiplexerRuntime, config: AgentMonitorConfig) => {
  const inspector = runtime.inspector;
  const screenCapture = runtime.screenCapture;
  const registry = createSessionRegistry();
  const stateTimeline = createSessionTimelineStore();
  const capturePaneFingerprint = runtime.captureFingerprint;
  const paneStates = createPaneStateStore();
  const customTitles = new Map<string, string>();
  const restored = restoreSessions();
  const restoredTimeline = restoreTimeline();
  const serverKey = runtime.serverKey;
  const eventsDir = path.join(baseDir, "events", serverKey);
  const eventLogPath = path.join(eventsDir, "claude.jsonl");
  const logActivity = createLogActivityPoller(config.activity.pollIntervalMs);
  const paneLogManager = createPaneLogManager({
    baseDir,
    serverKey,
    config,
    pipeSupport: runtime.pipeSupport,
    pipeManager: runtime.pipeManager,
    logActivity,
  });
  const jsonlTailer = createJsonlTailer(config.activity.pollIntervalMs);
  restoreMonitorRuntimeState({
    restoredSessions: restored,
    restoredTimeline,
    paneStates,
    customTitles,
    stateTimeline,
  });

  const savePersistedState = () => {
    saveState(registry.values(), { timeline: stateTimeline.serialize() });
  };
  const applyRestored = createRestoredSessionApplier(restored);
  const paneUpdateService = createPaneUpdateService({
    inspector,
    config,
    paneStates,
    paneLogManager,
    capturePaneFingerprint,
    applyRestored,
    getCustomTitle: (paneId) => customTitles.get(paneId) ?? null,
    customTitles,
    registry,
    stateTimeline,
    logActivity,
    savePersistedState,
  });
  const markPaneViewed = paneUpdateService.markPaneViewed;
  const updateFromPanes = paneUpdateService.updateFromPanes;

  const setCustomTitle = (paneId: string, title: string | null) => {
    if (title) {
      customTitles.set(paneId, title);
    } else {
      customTitles.delete(paneId);
    }
    const existing = registry.getDetail(paneId);
    if (!existing || existing.customTitle === (title ?? null)) {
      return;
    }
    const next = { ...existing, customTitle: title };
    registry.update(next);
    savePersistedState();
  };

  const handleHookEvent = (context: HookEventContext) => {
    const state = paneStates.get(context.paneId);
    state.hookState = context.hookState;
    state.lastEventAt = context.hookState.at;
  };

  const recordInput = (paneId: string, at = new Date().toISOString()) => {
    const state = paneStates.get(paneId);
    state.lastInputAt = at;
    const existing = registry.getDetail(paneId);
    if (!existing) {
      return;
    }
    if (existing.lastInputAt === at) {
      return;
    }
    const next = { ...existing, lastInputAt: at };
    registry.update(next);
    savePersistedState();
  };

  const startHookTailer = async () => {
    await ensureDir(eventsDir);
    await fs.open(eventLogPath, "a").then((handle) => handle.close());
    jsonlTailer.onLine((line) => {
      handleHookLine(line, registry.values(), handleHookEvent);
    });
    jsonlTailer.start(eventLogPath);
  };

  const monitorLoop = createMonitorLoop({
    intervalMs: config.activity.pollIntervalMs,
    eventLogPath,
    maxEventLogBytes: config.logs.maxEventLogBytes,
    retainRotations: config.logs.retainRotations,
    updateFromPanes,
  });

  const start = async () => {
    logActivity.onActivity((paneId, at) => {
      const state = paneStates.get(paneId);
      state.lastOutputAt = at;
    });
    logActivity.start();
    await startHookTailer();

    monitorLoop.start();

    await updateFromPanes();
  };

  const stop = () => {
    monitorLoop.stop();
    logActivity.stop();
    jsonlTailer.stop();
  };

  const getScreenCapture = () => screenCapture;
  const getStateTimeline = (
    paneId: string,
    range: SessionStateTimelineRange = "1h",
    limit = 200,
  ) => {
    return stateTimeline.getTimeline({ paneId, range, limit });
  };

  return {
    registry,
    start,
    stop,
    handleHookEvent,
    getScreenCapture,
    getStateTimeline,
    setCustomTitle,
    recordInput,
    markPaneViewed,
  };
};
