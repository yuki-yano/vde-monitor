import { estimateState } from "./state-estimator";
import type { HookStateSignal } from "@vde-monitor/multiplexer";

import type { AgentType } from "./agent-resolver-utils";

type ActivityThresholds = {
  runningThresholdMs: number;
};

type EstimateSessionStateArgs = {
  agent: AgentType;
  paneDead: boolean;
  lastOutputAt: string | null;
  hookState: HookStateSignal | null;
  codexQuestionPromptActive: boolean;
  activity: ActivityThresholds;
};

export const estimateSessionState = ({
  agent,
  paneDead,
  lastOutputAt,
  hookState,
  codexQuestionPromptActive,
  activity,
}: EstimateSessionStateArgs) => {
  const runningThresholdMs = Math.min(activity.runningThresholdMs, 10000);

  return estimateState({
    paneDead,
    lastOutputAt,
    hookState,
    codexQuestionPromptActive: agent === "codex" && codexQuestionPromptActive,
    thresholds: {
      runningThresholdMs,
      inactiveThresholdMs: 60000,
    },
  });
};
