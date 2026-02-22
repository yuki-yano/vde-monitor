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
import { configureVwGhRefreshIntervalMs } from "./monitor/vw-worktree";
import type { MultiplexerRuntime } from "./multiplexer/types";
import type { SessionTransitionEvent } from "./notifications/types";
import { createRepoNotesService } from "./repo-notes/service";
import { createRepoNotesStore } from "./repo-notes/store";
import { createSessionRegistry } from "./session-registry";
import { restorePersistedState, saveState } from "./state-store";
import { createSessionTimelineStore } from "./state-timeline/store";

const baseDir = path.join(os.homedir(), ".vde-monitor");

type CreateSessionMonitorOptions = {
  onSessionTransition?: (event: SessionTransitionEvent) => void | Promise<void>;
};

export const createSessionMonitor = (
  runtime: MultiplexerRuntime,
  config: AgentMonitorConfig,
  options: CreateSessionMonitorOptions = {},
) => {
  configureVwGhRefreshIntervalMs(config.activity.vwGhRefreshIntervalMs);

  const inspector = runtime.inspector;
  const screenCapture = runtime.screenCapture;
  const registry = createSessionRegistry();
  const stateTimeline = createSessionTimelineStore();
  const capturePaneFingerprint = runtime.captureFingerprint;
  const paneStates = createPaneStateStore();
  const customTitles = new Map<string, string>();
  const restoredState = restorePersistedState();
  const restored = restoredState.sessions;
  const restoredTimeline = restoredState.timeline;
  const restoredRepoNotes = restoredState.repoNotes;
  const repoNotes = createRepoNotesStore();
  repoNotes.restore(restoredRepoNotes);
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
    saveState(registry.values(), {
      timeline: stateTimeline.serialize(),
      repoNotes: repoNotes.serialize(),
    });
  };
  const repoNotesService = createRepoNotesService({
    registry,
    repoNotes,
    savePersistedState,
  });
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
    onStateTransition: options.onSessionTransition,
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
    state.agentSessionId = context.sessionId;
    state.agentSessionSource = "hook";
    state.agentSessionConfidence = "high";
    state.agentSessionObservedAt = context.hookState.at;
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
    limit?: number,
  ) => {
    return stateTimeline.getTimeline({ paneId, range, limit });
  };

  const getRepoStateTimeline = (
    paneId: string,
    range: SessionStateTimelineRange = "1h",
    limit?: number,
  ) => {
    const detail = registry.getDetail(paneId);
    const repoRoot = detail?.repoRoot;
    if (!repoRoot) {
      return null;
    }
    const paneIds = registry
      .values()
      .filter((session) => session.repoRoot === repoRoot)
      .map((session) => session.paneId);
    if (paneIds.length === 0) {
      return null;
    }
    return stateTimeline.getRepoTimeline({ paneId, paneIds, range, limit });
  };

  const getGlobalStateTimeline = (range: SessionStateTimelineRange = "1h", limit?: number) => {
    const paneIds = registry.values().map((session) => session.paneId);
    return stateTimeline.getRepoTimeline({
      paneId: "global",
      paneIds,
      range,
      limit,
      aggregateReason: "global:aggregate",
      itemIdPrefix: "global",
    });
  };

  const getRepoNotes = repoNotesService.listByPane;
  const createRepoNote = repoNotesService.createByPane;
  const updateRepoNote = repoNotesService.updateByPane;
  const deleteRepoNote = repoNotesService.deleteByPane;

  return {
    registry,
    start,
    stop,
    handleHookEvent,
    getScreenCapture,
    getStateTimeline,
    getRepoStateTimeline,
    getGlobalStateTimeline,
    getRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
    setCustomTitle,
    recordInput,
    markPaneViewed,
  };
};
