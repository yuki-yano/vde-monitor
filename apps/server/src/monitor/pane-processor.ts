import type { AgentMonitorConfig, PaneMeta, SessionDetail } from "@vde-monitor/shared";

import { resolvePaneContext } from "./pane-context-resolver";
import { buildPaneDetail } from "./pane-detail-builder";
import type { PaneLogManager } from "./pane-log-manager";
import { observePane, type PaneObservationDeps, type PaneStateStore } from "./pane-observation";
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

  const customTitle = getCustomTitle(pane.paneId);
  const paneContext = await resolvePaneContext({
    currentPath: pane.currentPath,
    resolveRepoRoot,
    resolveWorktreeStatus,
    resolveBranch,
  });

  return buildPaneDetail({
    pane,
    observation,
    paneContext,
    customTitle,
  });
};
