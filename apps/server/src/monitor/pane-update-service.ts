import type { AgentMonitorConfig, PaneMeta } from "@vde-monitor/multiplexer";
import type { SessionDetail, SessionStateTimelineSource } from "@vde-monitor/shared";

import { toErrorMessage } from "../errors";
import type { SessionTransitionEvent } from "../notifications/types";
import { createAgentProcessSnapshot } from "./agent-resolver-process";
import { mapWithConcurrencyLimitSettled } from "./concurrency";
import type { PaneLogManager } from "./pane-log-manager";
import { processPane } from "./pane-processor";
import { type PaneRuntimeState, updateManualSortAt } from "./pane-state";
import { createPaneStateCoordinator } from "./pane-state-coordinator";
import { cleanupRegistry } from "./registry-cleanup";
import { resolveRepoBranchCached } from "./repo-branch";
import { resolveRepoRootCached } from "./repo-root";
import { resolveVwWorktreeSnapshotCached, resolveWorktreeStatusFromSnapshot } from "./vw-worktree";

const PANE_PROCESS_CONCURRENCY = 8;
const VIEWED_PANE_TTL_MS = 20_000;

type PaneProcessingFailure = {
  count: number;
  firstFailedAt: string;
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
    repoRoot?: string | null;
    at?: string;
    source: SessionStateTimelineSource;
  }) => void;
  closePane: (input: { paneId: string; at?: string }) => void;
};

type RepositoryActivityStoreLike = {
  observePane: (input: {
    paneId: string;
    running: boolean;
    repoRoot: string | null;
    runId: string | null;
    verified: boolean;
    at?: string;
  }) => void;
  closePane: (paneId: string) => void;
  recordCompletedRun: (input: {
    epoch: string;
    runSeq: number;
    repoRoot: string | null;
    source: "hook:stop" | "herdr:done";
    at?: string;
  }) => void;
  recordCoverageGap: (input: { startedAt: string; endedAt: string }) => void;
};

type LogActivityLike = {
  unregister: (paneId: string) => void;
};

type CreatePaneUpdateServiceArgs = {
  inspector: InspectorLike;
  serverKey: string;
  config: AgentMonitorConfig;
  paneStates: PaneStateStoreLike;
  paneLogManager: PaneLogManager;
  capturePaneFingerprint: (
    paneId: string,
    useAlt: boolean,
    currentCommand?: string | null,
  ) => Promise<string | null>;
  getCustomTitle: (paneId: string) => string | null;
  customTitles: Map<string, string>;
  registry: RegistryLike;
  stateTimeline: TimelineStoreLike;
  repositoryActivity: RepositoryActivityStoreLike;
  logActivity: LogActivityLike;
  savePersistedState: () => void;
  observePaneMetadata?: (pane: PaneMeta) => void;
  removePaneObservation?: (paneId: string) => void;
  onPaneInventory?: (paneIds: string[]) => void;
  onPaneObservationCommitted?: (paneId: string) => void;
  onStateTransition?: (event: SessionTransitionEvent) => void | Promise<void>;
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

const stagePaneRuntimeState = (state: PaneRuntimeState): PaneRuntimeState => ({
  ...state,
  completionCursor: state.completionCursor == null ? null : { ...state.completionCursor },
  pendingRestoredCompletionCursor:
    state.pendingRestoredCompletionCursor == null
      ? null
      : { ...state.pendingRestoredCompletionCursor },
  pendingAgentLifecycleEvents: [...state.pendingAgentLifecycleEvents],
});

export const createPaneUpdateService = ({
  inspector,
  serverKey,
  config,
  paneStates,
  paneLogManager,
  capturePaneFingerprint,
  getCustomTitle,
  customTitles,
  registry,
  stateTimeline,
  repositoryActivity,
  logActivity,
  savePersistedState,
  observePaneMetadata,
  removePaneObservation,
  onPaneInventory,
  onPaneObservationCommitted,
  onStateTransition,
}: CreatePaneUpdateServiceArgs) => {
  const paneStateCoordinator = createPaneStateCoordinator({ serverKey });
  const viewedPaneAtMs = new Map<string, number>();
  const panePipeTagCache = new Map<string, string | null>();
  const panePipeTagInflight = new Map<string, Promise<string | null>>();
  const paneProcessingFailures = new Map<string, PaneProcessingFailure>();

  const recordPaneProcessingFailure = (paneId: string, reason: unknown) => {
    const failedAt = new Date().toISOString();
    const previous = paneProcessingFailures.get(paneId);
    const failure = {
      count: (previous?.count ?? 0) + 1,
      firstFailedAt: previous?.firstFailedAt ?? failedAt,
      lastFailedAt: failedAt,
      lastErrorMessage: toErrorMessage(reason),
    };
    paneProcessingFailures.set(paneId, failure);
    repositoryActivity.closePane(paneId);
    repositoryActivity.recordCoverageGap({
      startedAt: failure.firstFailedAt,
      endedAt: failure.lastFailedAt,
    });
  };

  const recordPaneProcessingRecovery = (paneId: string) => {
    const failure = paneProcessingFailures.get(paneId);
    if (!failure) return;
    repositoryActivity.recordCoverageGap({
      startedAt: failure.firstFailedAt,
      endedAt: new Date().toISOString(),
    });
    paneProcessingFailures.delete(paneId);
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

    const existingRequest = panePipeTagInflight.get(pane.paneId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = inspector
      .readUserOption(pane.paneId, "@vde-monitor_pipe")
      .then((fallback) => {
        cachePanePipeTagValue(pane.paneId, fallback);
        return fallback;
      })
      .finally(() => {
        panePipeTagInflight.delete(pane.paneId);
      });
    panePipeTagInflight.set(pane.paneId, request);
    return request;
  };

  const updateFromPanes = async () => {
    pruneStaleViewedPanes();
    const panes = await inspector.listPanes();
    onPaneInventory?.(panes.map((pane) => pane.paneId));
    panes.forEach((pane) => {
      observePaneMetadata?.(pane);
    });
    const processSnapshot =
      config.multiplexer.backend === "herdr" ? null : await createAgentProcessSnapshot();
    const activePaneIds = new Set<string>();
    const pendingTransitionEvents: SessionTransitionEvent[] = [];
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
      const request = resolveVwWorktreeSnapshotCached(cwd, { ghMode: "never" });
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
          processSnapshot,
          config,
          paneStates,
          paneLogManager,
          capturePaneFingerprint,
          getCustomTitle,
          resolveRepoRoot: async () => paneRepoRoot,
          resolveWorktreeStatus: (currentPath) =>
            resolveWorktreeStatusFromSnapshot(vwSnapshot, currentPath),
          resolveBranch: resolveRepoBranchCached,
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
        recordPaneProcessingFailure(pane.paneId, paneResult.reason);
        activePaneIds.add(pane.paneId);
        continue;
      }

      const observedDetail = paneResult.value;
      if (!observedDetail) {
        recordPaneProcessingRecovery(pane.paneId);
        onPaneObservationCommitted?.(pane.paneId);
        continue;
      }

      activePaneIds.add(pane.paneId);
      try {
        const paneState = paneStates.get(pane.paneId);
        const stagedPaneState = stagePaneRuntimeState(paneState);
        const completionCommit = paneStateCoordinator.applyObservation({
          pane,
          detail: observedDetail,
          paneState: stagedPaneState,
        });
        const detail = completionCommit.detail;
        const existing = registry.getDetail(pane.paneId);
        const paneTransitionEvents: SessionTransitionEvent[] = [];
        const transitionChanged =
          !existing ||
          existing.state !== detail.state ||
          existing.stateReason !== detail.stateReason ||
          existing.repoRoot !== detail.repoRoot;
        if (transitionChanged) {
          const transitionSource = resolveTimelineSource(detail.stateReason);
          stateTimeline.record({
            paneId: detail.paneId,
            state: detail.state,
            reason: detail.stateReason,
            repoRoot: detail.repoRoot ?? null,
            at: detail.lastEventAt ?? detail.lastOutputAt ?? detail.lastInputAt ?? undefined,
            source: transitionSource,
          });
        }
        const queueTransition = (completion: { epoch: string; completedSeq: number } | null) => {
          if (!onStateTransition) {
            return;
          }
          paneTransitionEvents.push({
            paneId: detail.paneId,
            previous: existing,
            next: detail,
            at:
              detail.lastEventAt ??
              detail.lastOutputAt ??
              detail.lastInputAt ??
              new Date().toISOString(),
            source: completionCommit.source,
            completionAdvanced: completion != null,
            completionEpoch: completion?.epoch ?? null,
            completedSeq: completion?.completedSeq ?? null,
          });
        };
        if (transitionChanged) {
          queueTransition(null);
        }
        completionCommit.advancedCompletions.forEach(queueTransition);
        registry.update(detail);
        Object.assign(paneState, stagedPaneState);
        completionCommit.activityTransitions.forEach((transition) => {
          repositoryActivity.observePane({
            paneId: detail.paneId,
            running: transition.type === "start",
            repoRoot: detail.repoRoot ?? null,
            runId: `${transition.epoch}:${transition.runSeq}`,
            verified: transition.type === "start",
            at: transition.at,
          });
        });
        const cursor = stagedPaneState.completionCursor;
        repositoryActivity.observePane({
          paneId: detail.paneId,
          running: stagedPaneState.lifecycle === "RUNNING",
          repoRoot: detail.repoRoot ?? null,
          runId: cursor?.openRunSeq == null ? null : `${cursor.epoch}:${cursor.openRunSeq}`,
          verified: false,
        });
        completionCommit.advancedCompletions.forEach(({ epoch, completedSeq, source, at }) => {
          if (source !== "hook:stop" && source !== "herdr:done") {
            return;
          }
          repositoryActivity.recordCompletedRun({
            epoch,
            runSeq: completedSeq,
            repoRoot: detail.repoRoot ?? null,
            source,
            at: at ?? undefined,
          });
        });
        pendingTransitionEvents.push(...paneTransitionEvents);
        onPaneObservationCommitted?.(pane.paneId);
        recordPaneProcessingRecovery(pane.paneId);
      } catch (error) {
        recordPaneProcessingFailure(pane.paneId, error);
      }
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
        panePipeTagInflight.delete(paneId);
        recordPaneProcessingRecovery(paneId);
        removePaneObservation?.(paneId);
      },
    });
    removedPaneIds.forEach((paneId) => {
      stateTimeline.closePane({ paneId });
      repositoryActivity.closePane(paneId);
    });
    const pipeCleanupPaneIds = new Set(removedPaneIds);
    paneLogManager.getOwnedPaneIds().forEach((paneId) => {
      if (!activePaneIds.has(paneId)) {
        pipeCleanupPaneIds.add(paneId);
      }
    });
    await Promise.allSettled(
      [...pipeCleanupPaneIds].map((paneId) =>
        paneLogManager.detachOwnedPipe(paneId, { forceCheck: true }),
      ),
    );
    savePersistedState();
    pendingTransitionEvents.forEach((transitionEvent) => {
      void Promise.resolve(onStateTransition?.(transitionEvent)).catch((error) => {
        const message = toErrorMessage(error, "failed to dispatch notification event");
        console.warn(`[vde-monitor] ${message}`);
      });
    });
  };

  const acknowledgeView = ({
    paneId,
    epoch,
    throughSeq,
  }: {
    paneId: string;
    epoch: string;
    throughSeq: number;
  }) => {
    const current = registry.getDetail(paneId);
    if (current == null) {
      return null;
    }
    const commit = paneStateCoordinator.acknowledgeView({
      detail: current,
      paneState: paneStates.get(paneId),
      epoch,
      throughSeq,
    });
    if (current.state !== commit.detail.state) {
      stateTimeline.record({
        paneId,
        state: commit.detail.state,
        reason: commit.detail.stateReason,
        repoRoot: commit.detail.repoRoot ?? null,
        source: "view",
      });
    }
    registry.update(commit.detail);
    savePersistedState();
    return commit.detail;
  };

  const moveSessionToTop = (paneId: string, at = new Date().toISOString()) => {
    const current = registry.getDetail(paneId);
    if (current == null) {
      return null;
    }
    const paneState = paneStates.get(paneId);
    const manualSortAt = updateManualSortAt(paneState, at);
    if (manualSortAt === current.manualSortAt) {
      return current;
    }
    const next = { ...current, manualSortAt };
    registry.update(next);
    savePersistedState();
    return next;
  };

  return {
    acknowledgeView,
    markPaneViewed,
    moveSessionToTop,
    updateFromPanes,
  };
};
