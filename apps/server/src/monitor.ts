import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type AgentMonitorConfig,
  type PaneMeta,
  type SessionStateTimelineRange,
  type SessionStateTimelineSource,
} from "@vde-monitor/shared";

import { createJsonlTailer, createLogActivityPoller, ensureDir } from "./logs";
import { handleHookLine, type HookEventContext } from "./monitor/hook-tailer";
import { createMonitorLoop } from "./monitor/loop";
import { createPaneLogManager } from "./monitor/pane-log-manager";
import { processPane } from "./monitor/pane-processor";
import { createPaneStateStore } from "./monitor/pane-state";
import { resolvePrCreatedCached } from "./monitor/pr-created";
import { cleanupRegistry } from "./monitor/registry-cleanup";
import { resolveRepoBranchCached } from "./monitor/repo-branch";
import { resolveRepoRootCached } from "./monitor/repo-root";
import {
  resolveVwWorktreeSnapshotCached,
  resolveWorktreeStatusFromSnapshot,
} from "./monitor/vw-worktree";
import type { MultiplexerRuntime } from "./multiplexer/types";
import { createSessionRegistry } from "./session-registry";
import { restoreSessions, restoreTimeline, saveState } from "./state-store";
import { createSessionTimelineStore } from "./state-timeline/store";

const baseDir = path.join(os.homedir(), ".vde-monitor");
const PANE_PROCESS_CONCURRENCY = 8;
const VIEWED_PANE_TTL_MS = 20_000;

export const mapWithConcurrencyLimit = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

const resolveTimelineSource = (reason: string): SessionStateTimelineSource => {
  if (reason === "restored") {
    return "restore";
  }
  if (reason.startsWith("hook:")) {
    return "hook";
  }
  return "poll";
};

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
  const restoredReason = new Set<string>();
  const viewedPaneAtMs = new Map<string, number>();
  const panePipeTagCache = new Map<string, string | null>();
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
  stateTimeline.restore(restoredTimeline);

  const savePersistedState = () => {
    saveState(registry.values(), { timeline: stateTimeline.serialize() });
  };

  restored.forEach((session, paneId) => {
    const state = paneStates.get(paneId);
    state.lastOutputAt = session.lastOutputAt ?? null;
    state.lastEventAt = session.lastEventAt ?? null;
    state.lastMessage = session.lastMessage ?? null;
    state.lastInputAt = session.lastInputAt ?? null;
    if (session.customTitle) {
      customTitles.set(paneId, session.customTitle);
    }
    if (!restoredTimeline.has(paneId)) {
      stateTimeline.record({
        paneId,
        state: session.state,
        reason: session.stateReason || "restored",
        at: session.lastEventAt ?? session.lastOutputAt ?? session.lastInputAt ?? undefined,
        source: "restore",
      });
    }
  });

  const applyRestored = (paneId: string) => {
    if (restored.has(paneId) && !restoredReason.has(paneId)) {
      restoredReason.add(paneId);
      return restored.get(paneId) ?? null;
    }
    return null;
  };

  const markPaneViewed = (paneId: string, atMs = Date.now()) => {
    viewedPaneAtMs.set(paneId, atMs);
  };

  const isPaneViewedRecently = (paneId: string, nowMs = Date.now()) => {
    const lastViewedAtMs = viewedPaneAtMs.get(paneId);
    if (lastViewedAtMs == null) {
      return false;
    }
    if (nowMs - lastViewedAtMs > VIEWED_PANE_TTL_MS) {
      viewedPaneAtMs.delete(paneId);
      return false;
    }
    return true;
  };

  const pruneStaleViewedPanes = (nowMs = Date.now()) => {
    viewedPaneAtMs.forEach((lastViewedAtMs, paneId) => {
      if (nowMs - lastViewedAtMs > VIEWED_PANE_TTL_MS) {
        viewedPaneAtMs.delete(paneId);
      }
    });
  };

  const cachePanePipeTagValue = (paneId: string, pipeTagValue: string | null) => {
    panePipeTagCache.set(paneId, pipeTagValue);
  };

  const resolvePanePipeTagValue = async (pane: PaneMeta) => {
    if (pane.pipeTagValue != null) {
      cachePanePipeTagValue(pane.paneId, pane.pipeTagValue);
      return pane.pipeTagValue;
    }

    if (panePipeTagCache.has(pane.paneId)) {
      return panePipeTagCache.get(pane.paneId) ?? null;
    }

    if (!pane.panePipe) {
      cachePanePipeTagValue(pane.paneId, null);
      return null;
    }

    const fallback = await inspector.readUserOption(pane.paneId, "@vde-monitor_pipe");
    cachePanePipeTagValue(pane.paneId, fallback);
    return fallback;
  };

  const updateFromPanes = async () => {
    pruneStaleViewedPanes();
    const panes = await inspector.listPanes();
    const activePaneIds = new Set<string>();
    const repoRootByCurrentPath = new Map<string, Promise<string | null>>();
    const vwSnapshotByCwd = new Map<
      string,
      Promise<Awaited<ReturnType<typeof resolveVwWorktreeSnapshotCached>>>
    >();

    const normalizeCacheKey = (value: string | null) => {
      if (!value) {
        return null;
      }
      const normalized = value.replace(/[\\/]+$/, "");
      return normalized.length > 0 ? normalized : value;
    };

    const resolvePaneRepoRoot = (currentPath: string | null) => {
      const key = normalizeCacheKey(currentPath);
      if (!key) {
        return Promise.resolve(null);
      }
      const existing = repoRootByCurrentPath.get(key);
      if (existing) {
        return existing;
      }
      const request = resolveRepoRootCached(currentPath);
      repoRootByCurrentPath.set(key, request);
      return request;
    };

    const resolveSnapshotByCwd = (cwd: string) => {
      const key = normalizeCacheKey(cwd) ?? cwd;
      const existing = vwSnapshotByCwd.get(key);
      if (existing) {
        return existing;
      }
      const request = resolveVwWorktreeSnapshotCached(cwd);
      vwSnapshotByCwd.set(key, request);
      return request;
    };

    const paneResults = await mapWithConcurrencyLimit(
      panes,
      PANE_PROCESS_CONCURRENCY,
      async (pane) => {
        const paneRepoRoot = await resolvePaneRepoRoot(pane.currentPath);
        const snapshotCwd = paneRepoRoot ?? pane.currentPath ?? process.cwd();
        const vwSnapshot = await resolveSnapshotByCwd(snapshotCwd);
        const detail = await processPane({
          pane,
          config,
          paneStates,
          paneLogManager,
          capturePaneFingerprint,
          applyRestored,
          getCustomTitle: (paneId) => customTitles.get(paneId) ?? null,
          resolveRepoRoot: async () => paneRepoRoot,
          resolveWorktreeStatus: (currentPath) =>
            resolveWorktreeStatusFromSnapshot(vwSnapshot, currentPath),
          resolveBranch: resolveRepoBranchCached,
          resolvePrCreated: resolvePrCreatedCached,
          isPaneViewedRecently,
          resolvePanePipeTagValue,
          cachePanePipeTagValue,
        });
        return { pane, detail };
      },
    );

    for (const { pane, detail } of paneResults) {
      if (!detail) {
        continue;
      }

      const existing = registry.getDetail(pane.paneId);
      activePaneIds.add(pane.paneId);
      if (
        !existing ||
        existing.state !== detail.state ||
        existing.stateReason !== detail.stateReason
      ) {
        stateTimeline.record({
          paneId: detail.paneId,
          state: detail.state,
          reason: detail.stateReason,
          at: detail.lastEventAt ?? detail.lastOutputAt ?? detail.lastInputAt ?? undefined,
          source: resolveTimelineSource(detail.stateReason),
        });
      }
      registry.update(detail);
    }

    const removedPaneIds = cleanupRegistry({
      registry,
      paneStates,
      customTitles,
      activePaneIds,
      saveState: () => undefined,
      onRemovedPaneId: (paneId) => {
        logActivity.unregister(paneId);
        viewedPaneAtMs.delete(paneId);
        panePipeTagCache.delete(paneId);
      },
    });
    removedPaneIds.forEach((paneId) => {
      stateTimeline.closePane({ paneId });
    });
    savePersistedState();
  };

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
