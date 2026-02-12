import type { AgentMonitorConfig, PaneMeta, SessionDetail } from "@vde-monitor/shared";

import { resolvePaneContext } from "./pane-context-resolver";
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
  const paneContext = await resolvePaneContext({
    currentPath: pane.currentPath,
    resolveRepoRoot,
    resolveWorktreeStatus,
    resolveBranch,
    resolvePrCreated,
  });
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
    ...paneContext,
  });
};
