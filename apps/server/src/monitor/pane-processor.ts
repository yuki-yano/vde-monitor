import type {
  AgentMonitorConfig,
  HookStateSignal,
  PaneMeta,
  SessionDetail,
} from "@vde-monitor/shared";

import { resolvePaneAgent } from "./agent-resolver";
import { isShellCommand } from "./agent-resolver-utils";
import type { PaneLogManager } from "./pane-log-manager";
import { updatePaneOutputState } from "./pane-output";
import type { PaneRuntimeState } from "./pane-state";
import { buildSessionDetail } from "./session-detail";
import { estimateSessionState } from "./session-state";

type PaneStateStore = {
  get: (paneId: string) => PaneRuntimeState;
};

type PaneProcessorDeps = {
  resolvePaneAgent?: typeof resolvePaneAgent;
  updatePaneOutputState?: typeof updatePaneOutputState;
  estimateSessionState?: typeof estimateSessionState;
};

type ProcessPaneArgs = {
  pane: PaneMeta;
  config: AgentMonitorConfig;
  paneStates: PaneStateStore;
  paneLogManager: PaneLogManager;
  capturePaneFingerprint: (paneId: string, useAlt: boolean) => Promise<string | null>;
  applyRestored: (paneId: string) => SessionDetail | null;
  getCustomTitle: (paneId: string) => string | null;
  resolveRepoRoot: (currentPath: string | null) => Promise<string | null>;
  isPaneViewedRecently?: (paneId: string) => boolean;
  resolvePanePipeTagValue?: (pane: PaneMeta) => Promise<string | null>;
  cachePanePipeTagValue?: (paneId: string, pipeTagValue: string | null) => void;
};

type EstimatedPaneState = {
  state: SessionDetail["state"];
  reason: string;
};

const FINGERPRINT_CAPTURE_INTERVAL_MS = 5000;

const resolvePaneKind = (agent: SessionDetail["agent"], pane: PaneMeta) => {
  const isShellCommandPane =
    isShellCommand(pane.paneStartCommand) || isShellCommand(pane.currentCommand);
  return {
    isAgent: agent !== "unknown",
    isShell: agent === "unknown" && isShellCommandPane,
  };
};

const resolvePipeStatus = async ({
  isAgent,
  pane,
  paneLogManager,
}: {
  isAgent: boolean;
  pane: PaneMeta;
  paneLogManager: PaneLogManager;
}) => {
  if (!isAgent) {
    return {
      pipeAttached: false,
      pipeConflict: false,
      logPath:
        paneLogManager.pipeSupport === "none" ? null : paneLogManager.getPaneLogPath(pane.paneId),
    };
  }
  return paneLogManager.preparePaneLogging({
    paneId: pane.paneId,
    panePipe: pane.panePipe,
    pipeTagValue: pane.pipeTagValue,
  });
};

const resolvePaneWithPipeTag = async ({
  pane,
  isAgent,
  resolvePanePipeTagValue,
}: {
  pane: PaneMeta;
  isAgent: boolean;
  resolvePanePipeTagValue?: (pane: PaneMeta) => Promise<string | null>;
}) => {
  if (!isAgent || pane.pipeTagValue != null || !resolvePanePipeTagValue) {
    return pane;
  }
  const resolvedPipeTagValue = await resolvePanePipeTagValue(pane);
  return { ...pane, pipeTagValue: resolvedPipeTagValue };
};

const resolveEstimatedState = ({
  isAgent,
  isShell,
  agent,
  paneDead,
  outputAt,
  hookState,
  activity,
  estimateState,
}: {
  isAgent: boolean;
  isShell: boolean;
  agent: SessionDetail["agent"];
  paneDead: boolean;
  outputAt: string | null;
  hookState: HookStateSignal | null;
  activity: AgentMonitorConfig["activity"];
  estimateState: typeof estimateSessionState;
}): EstimatedPaneState => {
  if (isAgent) {
    return estimateState({
      agent,
      paneDead,
      lastOutputAt: outputAt,
      hookState,
      activity,
    });
  }
  return {
    state: isShell ? "SHELL" : "UNKNOWN",
    reason: isShell ? "shell" : "process:unknown",
  };
};

const resolveFinalPaneState = (
  restoredSession: SessionDetail | null,
  estimatedState: EstimatedPaneState,
) => {
  if (!restoredSession) {
    return estimatedState;
  }
  return {
    state: restoredSession.state,
    reason: "restored",
  };
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
    isPaneViewedRecently,
    resolvePanePipeTagValue,
    cachePanePipeTagValue,
  }: ProcessPaneArgs,
  deps: PaneProcessorDeps = {},
): Promise<SessionDetail | null> => {
  const resolveAgent = deps.resolvePaneAgent ?? resolvePaneAgent;
  const updateOutput = deps.updatePaneOutputState ?? updatePaneOutputState;
  const estimateState = deps.estimateSessionState ?? estimateSessionState;

  const { agent, ignore } = await resolveAgent({
    currentCommand: pane.currentCommand,
    paneStartCommand: pane.paneStartCommand,
    paneTitle: pane.paneTitle,
    panePid: pane.panePid,
    paneTty: pane.paneTty,
  });
  if (ignore) {
    return null;
  }

  const { isAgent, isShell } = resolvePaneKind(agent, pane);
  const paneWithPipeTag = await resolvePaneWithPipeTag({
    pane,
    isAgent,
    resolvePanePipeTagValue,
  });
  const { pipeAttached, pipeConflict, logPath } = await resolvePipeStatus({
    isAgent,
    pane: paneWithPipeTag,
    paneLogManager,
  });
  if (isAgent && pipeAttached && !pipeConflict && paneWithPipeTag.pipeTagValue !== "1") {
    cachePanePipeTagValue?.(pane.paneId, "1");
  }

  const paneState = paneStates.get(pane.paneId);
  const allowFingerprintCapture = isAgent || Boolean(isPaneViewedRecently?.(pane.paneId));
  const { outputAt, hookState } = await updateOutput({
    pane: {
      paneId: pane.paneId,
      paneActivity: pane.paneActivity,
      windowActivity: pane.windowActivity,
      paneActive: pane.paneActive,
      paneDead: pane.paneDead,
      alternateOn: pane.alternateOn,
    },
    paneState,
    isAgentPane: isAgent,
    logPath,
    inactiveThresholdMs: config.activity.inactiveThresholdMs,
    deps: {
      captureFingerprint: capturePaneFingerprint,
      fingerprintIntervalMs: FINGERPRINT_CAPTURE_INTERVAL_MS,
      allowFingerprintCapture,
    },
  });

  const restoredSession = applyRestored(pane.paneId);
  const estimatedState = resolveEstimatedState({
    isAgent,
    isShell,
    agent,
    paneDead: pane.paneDead,
    outputAt,
    hookState,
    activity: config.activity,
    estimateState,
  });
  const finalState = resolveFinalPaneState(restoredSession, estimatedState);

  const customTitle = getCustomTitle(pane.paneId);
  const repoRoot = await resolveRepoRoot(pane.currentPath);
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
  });
};
