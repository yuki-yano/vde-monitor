import type { AgentMonitorConfig, PaneMeta, SessionDetail } from "@vde-monitor/shared";

import type { PaneLogManager } from "./pane-log-manager";
import { observePane, type PaneObservationDeps, type PaneStateStore } from "./pane-observation";
import { buildSessionDetail } from "./session-detail";
import type { ResolvedWorktreeStatus } from "./vw-worktree";

type PaneProcessorDeps = PaneObservationDeps;

type ProcessPaneArgs = {
  pane: PaneMeta;
  config: AgentMonitorConfig;
  paneStates: PaneStateStore;
  paneLogManager: PaneLogManager;
  capturePaneFingerprint: (paneId: string, useAlt: boolean) => Promise<string | null>;
  applyRestored: (paneId: string) => SessionDetail | null;
  getCustomTitle: (paneId: string) => string | null;
  resolveRepoRoot: (currentPath: string | null) => Promise<string | null>;
  resolveWorktreeStatus?: (
    currentPath: string | null,
  ) => ResolvedWorktreeStatus | Promise<ResolvedWorktreeStatus | null> | null;
  resolveBranch?: (currentPath: string | null) => Promise<string | null>;
  resolvePrCreated?: (repoRoot: string | null, branch: string | null) => Promise<boolean | null>;
  isPaneViewedRecently?: (paneId: string) => boolean;
  resolvePanePipeTagValue?: (pane: PaneMeta) => Promise<string | null>;
  cachePanePipeTagValue?: (paneId: string, pipeTagValue: string | null) => void;
};

const vwWorktreeSegmentPattern = /(^|[\\/])\.worktree([\\/]|$)/;

const normalizePathForCompare = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/[\\/]+$/, "");
  return normalized.length > 0 ? normalized : null;
};

const isSamePath = (left: string | null | undefined, right: string | null | undefined) => {
  const normalizedLeft = normalizePathForCompare(left);
  const normalizedRight = normalizePathForCompare(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
};

const isVwManagedWorktreePath = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }
  return vwWorktreeSegmentPattern.test(value.trim());
};

export const processPane = async (
  {
    pane,
    config,
    paneStates,
    paneLogManager,
    capturePaneFingerprint,
    applyRestored,
    getCustomTitle,
    resolveRepoRoot,
    resolveWorktreeStatus,
    resolveBranch,
    resolvePrCreated,
    isPaneViewedRecently,
    resolvePanePipeTagValue,
    cachePanePipeTagValue,
  }: ProcessPaneArgs,
  deps: PaneProcessorDeps = {},
): Promise<SessionDetail | null> => {
  const observation = await observePane(
    {
      pane,
      config,
      paneStates,
      paneLogManager,
      capturePaneFingerprint,
      applyRestored,
      isPaneViewedRecently,
      resolvePanePipeTagValue,
      cachePanePipeTagValue,
    },
    deps,
  );
  if (!observation) {
    return null;
  }
  const { agent, paneState, outputAt, pipeAttached, pipeConflict, finalState } = observation;

  const customTitle = getCustomTitle(pane.paneId);
  const [candidateWorktreeStatus, resolvedRepoRoot] = await Promise.all([
    resolveWorktreeStatus ? resolveWorktreeStatus(pane.currentPath) : Promise.resolve(null),
    resolveRepoRoot(pane.currentPath),
  ]);
  const worktreeStatus =
    candidateWorktreeStatus &&
    (resolvedRepoRoot == null || isSamePath(candidateWorktreeStatus.worktreePath, resolvedRepoRoot))
      ? candidateWorktreeStatus
      : null;
  const repoRoot = worktreeStatus?.repoRoot ?? resolvedRepoRoot;
  const branch = worktreeStatus?.branch ?? (await resolveBranch?.(pane.currentPath)) ?? null;
  const shouldResolvePrCreated = isVwManagedWorktreePath(worktreeStatus?.worktreePath);
  const worktreePrCreated =
    resolvePrCreated && shouldResolvePrCreated ? await resolvePrCreated(repoRoot, branch) : null;
  const inputAt = paneState.lastInputAt;

  return buildSessionDetail({
    pane,
    agent,
    state: finalState.state,
    stateReason: finalState.reason,
    lastMessage: paneState.lastMessage,
    lastOutputAt: outputAt,
    lastEventAt: paneState.lastEventAt,
    lastInputAt: inputAt,
    pipeAttached,
    pipeConflict,
    customTitle,
    repoRoot,
    branch,
    worktreePath: worktreeStatus?.worktreePath ?? null,
    worktreeDirty: worktreeStatus?.worktreeDirty ?? null,
    worktreeLocked: worktreeStatus?.worktreeLocked ?? null,
    worktreeLockOwner: worktreeStatus?.worktreeLockOwner ?? null,
    worktreeLockReason: worktreeStatus?.worktreeLockReason ?? null,
    worktreeMerged: worktreeStatus?.worktreeMerged ?? null,
    worktreePrCreated,
  });
};
