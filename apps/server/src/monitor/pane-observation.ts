import type {
  AgentMonitorConfig,
  HerdrAgentStatusSignal,
  HookStateSignal,
  PaneMeta,
} from "@vde-monitor/multiplexer";
import type { SessionDetail } from "@vde-monitor/shared";

import { resolvePaneAgent } from "./agent-resolver";
import type { AgentProcessSnapshot } from "./agent-resolver-process";
import type { AgentType } from "./agent-resolver-utils";
import { isShellCommand } from "./agent-resolver-utils";
import type { PaneLogManager } from "./pane-log-manager";
import { updatePaneOutputState } from "./pane-output";
import type { PaneRuntimeState } from "./pane-state";
import { estimateSessionState } from "./session-state";

export type PaneStateStore = {
  get: (paneId: string) => PaneRuntimeState;
};

export type PaneObservationDeps = {
  resolvePaneAgent?: (
    pane: Parameters<typeof resolvePaneAgent>[0],
    snapshot: AgentProcessSnapshot | null,
  ) => Promise<{
    agent: AgentType;
    ignore: boolean;
    presence?: "present" | "absent" | "indeterminate";
  }>;
  updatePaneOutputState?: typeof updatePaneOutputState;
  estimateSessionState?: typeof estimateSessionState;
};

type ObservePaneArgs = {
  pane: PaneMeta;
  processSnapshot: AgentProcessSnapshot | null;
  config: AgentMonitorConfig;
  paneStates: PaneStateStore;
  paneLogManager: PaneLogManager;
  capturePaneFingerprint: (
    paneId: string,
    useAlt: boolean,
    currentCommand?: string | null,
  ) => Promise<string | null>;
  isPaneViewedRecently?: (paneId: string) => boolean;
  resolvePanePipeTagValue?: (pane: PaneMeta) => Promise<string | null>;
  cachePanePipeTagValue?: (paneId: string, pipeTagValue: string | null) => void;
};

type EstimatedPaneState = {
  state: SessionDetail["state"];
  reason: string;
};

export type PaneObservation = {
  agent: SessionDetail["agent"];
  pipeAttached: boolean;
  pipeConflict: boolean;
  paneState: PaneRuntimeState;
  outputAt: string | null;
  finalState: EstimatedPaneState;
  agentPresence: "present" | "absent" | "indeterminate";
  confirmedAgentAbsent: boolean;
  agentBecameAbsent: boolean;
};

const FINGERPRINT_CAPTURE_INTERVAL_MS = 5000;

export const applyAgentPresenceObservation = ({
  observedAgent,
  presence,
  paneState,
}: {
  observedAgent: AgentType;
  presence: "present" | "absent" | "indeterminate";
  paneState: PaneRuntimeState;
}) => {
  const wasPresent = paneState.agentPresent;
  paneState.agentPresence = presence;

  if (presence === "present") {
    paneState.lastResolvedAgent = observedAgent;
    paneState.agentPresent = true;
    paneState.consecutiveAbsentObservations = 0;
    return {
      agent: observedAgent,
      preserveResolvedState: false,
      confirmedAgentAbsent: false,
      agentBecameAbsent: false,
    };
  }

  if (presence === "indeterminate") {
    return {
      agent: paneState.lastResolvedAgent,
      preserveResolvedState: true,
      confirmedAgentAbsent: false,
      agentBecameAbsent: false,
    };
  }

  paneState.consecutiveAbsentObservations += 1;
  const confirmedAgentAbsent = paneState.consecutiveAbsentObservations >= 2;
  if (!confirmedAgentAbsent) {
    return {
      agent: paneState.lastResolvedAgent,
      preserveResolvedState: true,
      confirmedAgentAbsent: false,
      agentBecameAbsent: false,
    };
  }

  paneState.agentPresent = false;
  return {
    agent: "unknown" as const,
    preserveResolvedState: false,
    confirmedAgentAbsent: true,
    agentBecameAbsent: wasPresent,
  };
};

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
  allowAttach,
  pane,
  paneLogManager,
}: {
  isAgent: boolean;
  allowAttach: boolean;
  pane: PaneMeta;
  paneLogManager: PaneLogManager;
}) => {
  if (!isAgent) {
    return {
      pipeAttached: false,
      pipeConflict: false,
      logPath: paneLogManager.hasPipeCapability ? paneLogManager.getPaneLogPath(pane.paneId) : null,
      ownerTag: null,
    };
  }
  return paneLogManager.preparePaneLogging({
    paneId: pane.paneId,
    panePipe: pane.panePipe,
    pipeTagValue: pane.pipeTagValue,
    allowAttach,
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
  herdrAgentStatus,
  codexQuestionPromptActive,
  activity,
  estimateState,
}: {
  isAgent: boolean;
  isShell: boolean;
  agent: SessionDetail["agent"];
  paneDead: boolean;
  outputAt: string | null;
  hookState: HookStateSignal | null;
  herdrAgentStatus: HerdrAgentStatusSignal | null;
  codexQuestionPromptActive: boolean;
  activity: AgentMonitorConfig["activity"];
  estimateState: typeof estimateSessionState;
}): EstimatedPaneState => {
  if (isAgent) {
    return estimateState({
      agent,
      paneDead,
      lastOutputAt: outputAt,
      hookState,
      herdrAgentStatus,
      codexQuestionPromptActive,
      activity,
    });
  }
  return {
    state: isShell ? "SHELL" : "UNKNOWN",
    reason: isShell ? "shell" : "process:unknown",
  };
};

export const observePane = async (
  {
    pane,
    processSnapshot,
    config,
    paneStates,
    paneLogManager,
    capturePaneFingerprint,
    isPaneViewedRecently,
    resolvePanePipeTagValue,
    cachePanePipeTagValue,
  }: ObservePaneArgs,
  deps: PaneObservationDeps = {},
): Promise<PaneObservation | null> => {
  const resolveAgent = deps.resolvePaneAgent ?? resolvePaneAgent;
  const updateOutput = deps.updatePaneOutputState ?? updatePaneOutputState;
  const estimateState = deps.estimateSessionState ?? estimateSessionState;

  const resolution = await resolveAgent(
    {
      currentCommand: pane.currentCommand,
      paneStartCommand: pane.paneStartCommand,
      paneTitle: pane.paneTitle,
      panePid: pane.panePid,
      paneTty: pane.paneTty,
    },
    processSnapshot,
  );
  const { ignore } = resolution;
  if (ignore) {
    return null;
  }

  const paneState = paneStates.get(pane.paneId);
  const observedPresence =
    resolution.presence ?? (resolution.agent === "unknown" ? "absent" : "present");
  const presenceResult =
    resolution.presence == null
      ? {
          agent: resolution.agent,
          preserveResolvedState: false,
          confirmedAgentAbsent: false,
          agentBecameAbsent: false,
        }
      : applyAgentPresenceObservation({
          observedAgent: resolution.agent,
          presence: observedPresence,
          paneState,
        });
  const agent = presenceResult.agent;

  if (presenceResult.confirmedAgentAbsent) {
    await paneLogManager.detachOwnedPipe(pane.paneId);
  }

  const { isAgent, isShell } = resolvePaneKind(agent, pane);
  const paneWithPipeTag = await resolvePaneWithPipeTag({
    pane,
    isAgent,
    resolvePanePipeTagValue,
  });
  const pipeStatus = await resolvePipeStatus({
    isAgent,
    allowAttach: observedPresence === "present",
    pane: paneWithPipeTag,
    paneLogManager,
  });
  const { pipeAttached, pipeConflict, logPath } = pipeStatus;
  if (
    isAgent &&
    pipeAttached &&
    !pipeConflict &&
    pipeStatus.ownerTag != null &&
    paneWithPipeTag.pipeTagValue !== pipeStatus.ownerTag
  ) {
    cachePanePipeTagValue?.(pane.paneId, pipeStatus.ownerTag);
  }

  const allowFingerprintCapture = isAgent || Boolean(isPaneViewedRecently?.(pane.paneId));
  const {
    outputAt,
    hookState,
    codexQuestionPromptActive = false,
  } = presenceResult.preserveResolvedState
    ? {
        outputAt: paneState.lastOutputAt,
        hookState: paneState.hookState,
        codexQuestionPromptActive: paneState.codexQuestionPromptActive,
      }
    : await updateOutput({
        pane: {
          paneId: pane.paneId,
          paneActivity: pane.paneActivity,
          paneActive: pane.paneActive,
          paneDead: pane.paneDead,
          alternateOn: pane.alternateOn,
          currentCommand: pane.currentCommand,
        },
        paneState,
        isAgentPane: isAgent,
        isCodexAgentPane: agent === "codex",
        logPath,
        inactiveThresholdMs: 60000,
        deps: {
          captureFingerprint: capturePaneFingerprint,
          fingerprintIntervalMs: FINGERPRINT_CAPTURE_INTERVAL_MS,
          allowFingerprintCapture,
        },
      });

  const estimatedState = resolveEstimatedState({
    isAgent,
    isShell,
    agent,
    paneDead: pane.paneDead,
    outputAt,
    hookState,
    herdrAgentStatus: paneState.herdrAgentStatus ?? null,
    codexQuestionPromptActive,
    activity: config.activity,
    estimateState,
  });

  let finalState = estimatedState;
  if (
    presenceResult.preserveResolvedState &&
    paneState.lastResolvedState != null &&
    paneState.lastResolvedStateReason != null
  ) {
    finalState = {
      state: paneState.lastResolvedState,
      reason: paneState.lastResolvedStateReason,
    };
  } else {
    paneState.lastResolvedState = finalState.state;
    paneState.lastResolvedStateReason = finalState.reason;
  }

  return {
    agent,
    pipeAttached,
    pipeConflict,
    paneState,
    outputAt,
    finalState,
    agentPresence: observedPresence,
    confirmedAgentAbsent: presenceResult.confirmedAgentAbsent,
    agentBecameAbsent: presenceResult.agentBecameAbsent,
  };
};
