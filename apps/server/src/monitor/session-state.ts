import { estimateState } from "./state-estimator";
import type { HerdrAgentStatusSignal, HookStateSignal } from "@vde-monitor/multiplexer";

import type { AgentType } from "./agent-resolver-utils";

type ActivityThresholds = {
  runningThresholdMs: number;
};

type EstimateSessionStateArgs = {
  agent: AgentType;
  paneDead: boolean;
  lastOutputAt: string | null;
  hookState: HookStateSignal | null;
  herdrAgentStatus?: HerdrAgentStatusSignal | null;
  codexQuestionPromptActive: boolean;
  activity: ActivityThresholds;
};

export const estimateSessionState = ({
  agent,
  paneDead,
  lastOutputAt,
  hookState,
  herdrAgentStatus = null,
  codexQuestionPromptActive,
  activity,
}: EstimateSessionStateArgs) => {
  const runningThresholdMs = Math.min(activity.runningThresholdMs, 10000);

  return estimateState({
    paneDead,
    lastOutputAt,
    hookState,
    herdrAgentStatus,
    codexQuestionPromptActive: agent === "codex" && codexQuestionPromptActive,
    thresholds: {
      runningThresholdMs,
      inactiveThresholdMs: 60000,
    },
  });
};
