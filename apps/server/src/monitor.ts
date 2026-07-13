import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveSocketPath, subscribeHerdrEvents } from "@vde-monitor/herdr";
import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import type { SessionStateTimelineRange } from "@vde-monitor/shared";
import { resolveMonitorRuntimeMarkerPath } from "@vde-monitor/shared/node";

import { createJsonlTailer, createLogActivityPoller, ensureDir } from "./logs";
import { type HookEventContext, handleCodexHookLine, handleHookLine } from "./monitor/hook-tailer";
import { createMonitorLoop } from "./monitor/loop";
import {
  resolvePersistedSessionRuntimeState,
  restoreMonitorRuntimeState,
} from "./monitor/monitor-persistence";
import { createPaneObservationCoordinator } from "./monitor/pane-observation-coordinator";
import { createPaneLogManager } from "./monitor/pane-log-manager";
import { createPaneStateStore } from "./monitor/pane-state";
import { createPaneUpdateService } from "./monitor/pane-update-service";
import { createMonitorRuntimeMarker, resolveProcessStartedAt } from "./monitor/runtime-marker";
import { markHerdrLifecycleDirty, normalizeFingerprint } from "./monitor/monitor-utils";
import { configureVwGhRefreshIntervalMs } from "./monitor/vw-worktree";
import type { MultiplexerRuntime } from "@vde-monitor/multiplexer";
import type { SessionTransitionEvent } from "./notifications/types";
import { createRepoNotesService } from "./repo-notes/service";
import { createRepoNotesStore } from "./repo-notes/store";
import { createRepositoryActivityStore } from "./repository-activity/store";
import { createSessionRegistry } from "./session-registry";
import { restorePersistedState, saveState } from "./state-store";
import { createSessionTimelineStore } from "./state-timeline/store";

const baseDir = path.join(os.homedir(), ".vde-monitor");

type CreateSessionMonitorOptions = {
  onSessionTransition?: (event: SessionTransitionEvent) => void | Promise<void>;
};

export const detachOwnedPipesForShutdown = async ({
  paneIds,
  detachOwnedPipe,
}: {
  paneIds: string[];
  detachOwnedPipe: (paneId: string, options: { forceCheck: true }) => Promise<unknown>;
}): Promise<void> => {
  await Promise.allSettled(paneIds.map((paneId) => detachOwnedPipe(paneId, { forceCheck: true })));
};

export const resolveShutdownPaneIds = (registryPaneIds: string[], ownedPaneIds: string[]) => [
  ...new Set([...registryPaneIds, ...ownedPaneIds]),
];

export const createTrackedPaneUpdater = (update: () => Promise<void>) => {
  let accepting = true;
  let inFlight: Promise<void> | null = null;

  const run = (): Promise<void> => {
    if (!accepting) return Promise.resolve();
    if (inFlight != null) return inFlight;
    const request = Promise.resolve()
      .then(update)
      .finally(() => {
        if (inFlight === request) {
          inFlight = null;
        }
      });
    inFlight = request;
    return request;
  };

  const stop = async (): Promise<void> => {
    accepting = false;
    await Promise.allSettled([inFlight ?? Promise.resolve()]);
  };

  return { run, stop };
};

export const createSessionMonitor = (
  runtime: MultiplexerRuntime,
  config: AgentMonitorConfig,
  options: CreateSessionMonitorOptions = {},
) => {
  configureVwGhRefreshIntervalMs(30_000);

  const inspector = runtime.inspector;
  const screenCapture = runtime.screenCapture;
  const registry = createSessionRegistry();
  const stateTimeline = createSessionTimelineStore();
  const repositoryActivity = createRepositoryActivityStore();
  const observationCoordinator = createPaneObservationCoordinator({
    executeBatch: (requests, signal) =>
      screenCapture.captureTextBatch(
        requests.map(({ requestId, options }) => ({ requestId, options })),
        { signal },
      ),
  });
  const capturePaneFingerprint = async (
    paneId: string,
    useAlt: boolean,
    currentCommand?: string | null,
  ) => {
    const captured = await observationCoordinator
      .requestCapture({
        purpose: "fingerprint",
        priority: "background",
        options: {
          paneId,
          lines: 200,
          joinLines: false,
          includeAnsi: false,
          includeTruncated: false,
          altScreen: "auto",
          alternateOn: useAlt,
          currentCommand,
        },
      })
      .catch(() => null);
    return captured ? normalizeFingerprint(captured.screen) : null;
  };
  const paneStates = createPaneStateStore();
  const customTitles = new Map<string, string>();
  const restoredState = restorePersistedState();
  const restored = restoredState.sessions;
  const retainedRestoredSessions = new Map(restored);
  const restoredTimeline = restoredState.timeline;
  const restoredRepoNotes = restoredState.repoNotes;
  repositoryActivity.restore(restoredState.repositoryActivity);
  const repoNotes = createRepoNotesStore();
  repoNotes.restore(restoredRepoNotes);
  const serverKey = runtime.serverKey;
  const eventsDir = path.join(baseDir, "events", serverKey);
  const eventLogPath = path.join(eventsDir, "claude.jsonl");
  const codexEventLogPath = path.join(eventsDir, "codex.jsonl");
  const runtimeMarker =
    runtime.backend === "cmux"
      ? createMonitorRuntimeMarker({
          markerPath: resolveMonitorRuntimeMarkerPath(baseDir, serverKey, process.pid),
          marker: {
            backend: "cmux",
            serverKey,
            pid: process.pid,
            processStartedAt: resolveProcessStartedAt(process.pid),
          },
        })
      : null;
  const logActivity = createLogActivityPoller(config.activity.pollIntervalMs);
  const paneLogManager = createPaneLogManager({
    baseDir,
    serverKey,
    pipeCapability: runtime.capabilities.pipe,
    logActivity,
  });
  const jsonlTailer = createJsonlTailer(config.activity.pollIntervalMs);
  const codexJsonlTailer = createJsonlTailer(config.activity.pollIntervalMs);
  let herdrEventSubscription: Awaited<ReturnType<typeof subscribeHerdrEvents>> | null = null;
  let herdrEventSubscriptionRefresh: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  restoreMonitorRuntimeState({
    restoredSessions: restored,
    restoredTimeline,
    paneStates,
    customTitles,
    stateTimeline,
  });

  const savePersistedState = () => {
    const runtimeStateByPaneId = new Map(
      registry.values().map((session) => {
        const state = paneStates.get(session.paneId);
        return [session.paneId, resolvePersistedSessionRuntimeState(state)] as const;
      }),
    );
    saveState(registry.values(), {
      runtimeStateByPaneId,
      retainedSessions: retainedRestoredSessions,
      timeline: stateTimeline.serialize(),
      repoNotes: repoNotes.serialize(),
      repositoryActivity: repositoryActivity.serialize(),
    });
  };
  const repoNotesService = createRepoNotesService({
    registry,
    repoNotes,
    savePersistedState,
  });
  const paneUpdateService = createPaneUpdateService({
    inspector,
    serverKey,
    config,
    paneStates,
    paneLogManager,
    capturePaneFingerprint,
    getCustomTitle: (paneId) => customTitles.get(paneId) ?? null,
    customTitles,
    registry,
    stateTimeline,
    repositoryActivity,
    logActivity,
    savePersistedState,
    observePaneMetadata: (pane) => {
      observationCoordinator.observeMetadata(pane.paneId, {
        paneActivity: pane.paneActivity,
        alternateOn: pane.alternateOn,
        currentCommand: pane.currentCommand,
      });
    },
    removePaneObservation: observationCoordinator.removePane,
    onPaneInventory: (paneIds) => {
      const activePaneIds = new Set(paneIds);
      retainedRestoredSessions.forEach((_session, paneId) => {
        if (!activePaneIds.has(paneId)) {
          retainedRestoredSessions.delete(paneId);
        }
      });
    },
    onPaneObservationCommitted: (paneId) => {
      retainedRestoredSessions.delete(paneId);
    },
    onStateTransition: options.onSessionTransition,
  });
  const markPaneViewed = paneUpdateService.markPaneViewed;
  const acknowledgeView = paneUpdateService.acknowledgeView;
  const paneUpdater = createTrackedPaneUpdater(paneUpdateService.updateFromPanes);
  const updateFromPanes = paneUpdater.run;

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
    observationCoordinator.markDirty(context.paneId, "hook");
    const state = paneStates.get(context.paneId);
    state.pendingAgentLifecycleEvents.push({
      source: "hook",
      agent: context.agent,
      eventName: context.eventName,
      sessionId: context.sessionId,
      at: context.hookState.at,
    });
    state.hookState = context.hookState;
    state.lastEventAt = context.hookState.at;
  };

  const handleHerdrStateSignal = (signal: {
    paneId: string;
    agentStatus: "working" | "blocked" | "done" | "idle";
    at: string;
  }) => {
    observationCoordinator.markDirty(signal.paneId, "herdr");
    const state = paneStates.get(signal.paneId);
    state.herdrAgentStatus = {
      agentStatus: signal.agentStatus,
      at: signal.at,
    };
    state.pendingAgentLifecycleEvents.push({
      source: "herdr",
      agentStatus: signal.agentStatus,
      at: signal.at,
    });
    state.lastEventAt = signal.at;
    void updateFromPanes().catch(() => undefined);
  };

  const recordInput = (paneId: string, at = new Date().toISOString()) => {
    observationCoordinator.markDirty(paneId, "send");
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

  const moveSessionToTop = (paneId: string, at = new Date().toISOString()) => {
    paneUpdateService.moveSessionToTop(paneId, at);
  };

  const startHookTailer = async () => {
    await ensureDir(eventsDir);
    await fs.open(eventLogPath, "a").then((handle) => handle.close());
    await fs.open(codexEventLogPath, "a").then((handle) => handle.close());
    jsonlTailer.onLine((line) => {
      handleHookLine(line, registry.values(), handleHookEvent);
    });
    codexJsonlTailer.onLine((line) => {
      handleCodexHookLine(line, registry.values(), handleHookEvent);
    });
    await Promise.all([jsonlTailer.start(eventLogPath), codexJsonlTailer.start(codexEventLogPath)]);
  };

  const refreshHerdrEventSubscription = async () => {
    if (runtime.backend !== "herdr") {
      return;
    }
    if (herdrEventSubscriptionRefresh != null) {
      return herdrEventSubscriptionRefresh;
    }
    herdrEventSubscriptionRefresh = (async () => {
      const previous = herdrEventSubscription;
      herdrEventSubscription = null;
      await previous?.stop();

      const panes = await inspector.listPanes();
      herdrEventSubscription = await subscribeHerdrEvents({
        socketPath: resolveSocketPath(process.env, os.homedir()),
        paneIds: panes.map((pane) => pane.paneId),
        onSignal: handleHerdrStateSignal,
        onLifecycleEvent: (event) => {
          markHerdrLifecycleDirty(event, observationCoordinator.markDirty);
          void updateFromPanes().catch(() => undefined);
          void refreshHerdrEventSubscription();
        },
      });
    })().finally(() => {
      herdrEventSubscriptionRefresh = null;
    });
    return herdrEventSubscriptionRefresh;
  };

  const startHerdrEventSubscription = async () => {
    await refreshHerdrEventSubscription();
  };

  const monitorLoop = createMonitorLoop({
    intervalMs: config.activity.pollIntervalMs,
    eventLogPaths: [eventLogPath, codexEventLogPath],
    maxEventLogBytes: 2_000_000,
    retainRotations: 5,
    updateFromPanes,
  });

  const start = async () => {
    try {
      logActivity.onActivity((paneId, at) => {
        observationCoordinator.markDirty(paneId, "pipe");
        const state = paneStates.get(paneId);
        state.lastOutputAt = at;
      });
      logActivity.start();
      await startHookTailer();
      // Publish only after tailers are ready so the first redirected hook event is not skipped.
      await runtimeMarker?.write();
      await startHerdrEventSubscription();

      monitorLoop.start();

      await updateFromPanes();
    } catch (error) {
      await runtimeMarker?.removeIfOwned().catch(() => undefined);
      throw error;
    }
  };

  const stop = (): Promise<void> => {
    if (stopPromise != null) return stopPromise;
    monitorLoop.stop();
    logActivity.stop();
    const subscription = herdrEventSubscription;
    herdrEventSubscription = null;
    observationCoordinator.dispose();
    stopPromise = (async () => {
      await Promise.allSettled([runtimeMarker?.removeIfOwned() ?? Promise.resolve()]);
      jsonlTailer.stop();
      codexJsonlTailer.stop();
      await Promise.allSettled([subscription?.stop() ?? Promise.resolve(), paneUpdater.stop()]);
      await detachOwnedPipesForShutdown({
        paneIds: resolveShutdownPaneIds(
          registry.values().map((session) => session.paneId),
          paneLogManager.getOwnedPaneIds(),
        ),
        detachOwnedPipe: paneLogManager.detachOwnedPipe,
      });
    })();
    return stopPromise;
  };

  const getScreenCapture = (priority: "foreground" | "background" = "foreground") => ({
    captureText: async (captureOptions: Parameters<typeof screenCapture.captureText>[0]) => {
      const result = await observationCoordinator.requestCapture({
        purpose: "screen",
        priority,
        options: captureOptions,
      });
      if (result == null) {
        throw new Error("screen capture was dropped");
      }
      return result;
    },
  });
  const markPaneObservationDirty = (
    paneId: string,
    source: "focus" | "subscriber" = "subscriber",
  ) => observationCoordinator.markDirty(paneId, source);
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

  const getRepositoryActivity = (range: SessionStateTimelineRange = "24h") =>
    repositoryActivity.getActivity(range);

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
    getRepositoryActivity,
    getRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
    setCustomTitle,
    acknowledgeView,
    recordInput,
    moveSessionToTop,
    markPaneViewed,
    markPaneObservationDirty,
  };
};
