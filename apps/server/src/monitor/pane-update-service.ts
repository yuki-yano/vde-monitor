import type {
  AgentMonitorConfig,
  PaneMeta,
  SessionDetail,
  SessionStateTimelineSource,
} from "@vde-monitor/shared";

import { mapWithConcurrencyLimitSettled } from "./concurrency";
import type { PaneLogManager } from "./pane-log-manager";
import { processPane } from "./pane-processor";
import type { PaneRuntimeState } from "./pane-state";
import { resolvePrCreatedCached } from "./pr-created";
import { cleanupRegistry } from "./registry-cleanup";
import { resolveRepoBranchCached } from "./repo-branch";
import { resolveRepoRootCached } from "./repo-root";
import { resolveVwWorktreeSnapshotCached, resolveWorktreeStatusFromSnapshot } from "./vw-worktree";

const PANE_PROCESS_CONCURRENCY = 8;
const VIEWED_PANE_TTL_MS = 20_000;

type PaneProcessingFailure = {
  count: number;
  lastFailedAt: string;
  lastErrorMessage: string;
};

type InspectorLike = {
  listPanes: () => Promise<PaneMeta[]>;
  readUserOption: (paneId: string, optionName: string) => Promise<string | null>;
};

type PaneStateStoreLike = {
  get: (paneId: string) => PaneRuntimeState;
  remove: (paneId: string) => void;
  pruneMissing: (activePaneIds: Set<string>) => void;
};

type RegistryLike = {
  getDetail: (paneId: string) => SessionDetail | null;
  update: (detail: SessionDetail) => void;
  removeMissing: (activePaneIds: Set<string>) => string[];
  values: () => SessionDetail[];
};

type TimelineStoreLike = {
  record: (event: {
    paneId: string;
    state: SessionDetail["state"];
    reason: string;
    at?: string;
    source: SessionStateTimelineSource;
  }) => void;
  closePane: (input: { paneId: string; at?: string }) => void;
};

type LogActivityLike = {
  unregister: (paneId: string) => void;
};

type CreatePaneUpdateServiceArgs = {
  inspector: InspectorLike;
  config: AgentMonitorConfig;
  paneStates: PaneStateStoreLike;
  paneLogManager: PaneLogManager;
  capturePaneFingerprint: (paneId: string, useAlt: boolean) => Promise<string | null>;
  applyRestored: (paneId: string) => SessionDetail | null;
  getCustomTitle: (paneId: string) => string | null;
  customTitles: Map<string, string>;
  registry: RegistryLike;
  stateTimeline: TimelineStoreLike;
  logActivity: LogActivityLike;
  savePersistedState: () => void;
};

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
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

const normalizeCacheKey = (value: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[\\/]+$/, "");
  return normalized.length > 0 ? normalized : value;
};

export const createPaneUpdateService = ({
  inspector,
  config,
  paneStates,
  paneLogManager,
  capturePaneFingerprint,
  applyRestored,
  getCustomTitle,
  customTitles,
  registry,
  stateTimeline,
  logActivity,
  savePersistedState,
}: CreatePaneUpdateServiceArgs) => {
  const viewedPaneAtMs = new Map<string, number>();
  const panePipeTagCache = new Map<string, string | null>();
  const paneProcessingFailures = new Map<string, PaneProcessingFailure>();

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

    const paneResults = await mapWithConcurrencyLimitSettled(
      panes,
      PANE_PROCESS_CONCURRENCY,
      async (pane) => {
        const paneRepoRoot = await resolvePaneRepoRoot(pane.currentPath);
        const snapshotCwd = paneRepoRoot ?? pane.currentPath ?? process.cwd();
        const vwSnapshot = await resolveSnapshotByCwd(snapshotCwd);
        return processPane({
          pane,
          config,
          paneStates,
          paneLogManager,
          capturePaneFingerprint,
          applyRestored,
          getCustomTitle,
          resolveRepoRoot: async () => paneRepoRoot,
          resolveWorktreeStatus: (currentPath) =>
            resolveWorktreeStatusFromSnapshot(vwSnapshot, currentPath),
          resolveBranch: resolveRepoBranchCached,
          resolvePrCreated: resolvePrCreatedCached,
          isPaneViewedRecently,
          resolvePanePipeTagValue,
          cachePanePipeTagValue,
        });
      },
    );

    for (const [index, paneResult] of paneResults.entries()) {
      const pane = panes[index];
      if (!pane) {
        continue;
      }

      if (paneResult.status === "rejected") {
        const failedAt = new Date().toISOString();
        const previous = paneProcessingFailures.get(pane.paneId);
        paneProcessingFailures.set(pane.paneId, {
          count: (previous?.count ?? 0) + 1,
          lastFailedAt: failedAt,
          lastErrorMessage: resolveErrorMessage(paneResult.reason),
        });
        activePaneIds.add(pane.paneId);
        continue;
      }

      paneProcessingFailures.delete(pane.paneId);
      const detail = paneResult.value;
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
        paneProcessingFailures.delete(paneId);
      },
    });
    removedPaneIds.forEach((paneId) => {
      stateTimeline.closePane({ paneId });
    });
    savePersistedState();
  };

  return {
    markPaneViewed,
    updateFromPanes,
  };
};
