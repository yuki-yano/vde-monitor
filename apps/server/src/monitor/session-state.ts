import { estimateState } from "@vde-monitor/agents";
import type { HookStateSignal } from "@vde-monitor/shared";

import type { AgentType } from "./agent-resolver-utils";

type ActivityThresholds = {
  runningThresholdMs: number;
  inactiveThresholdMs: number;
};

type EstimateSessionStateArgs = {
  agent: AgentType;
  paneDead: boolean;
  lastOutputAt: string | null;
  hookState: HookStateSignal | null;
  activity: ActivityThresholds;
};

export const estimateSessionState = ({
  paneDead,
  lastOutputAt,
  hookState,
  activity,
}: EstimateSessionStateArgs) => {
  const runningThresholdMs = Math.min(activity.runningThresholdMs, 10000);

  return estimateState({
    paneDead,
    lastOutputAt,
    hookState,
    thresholds: {
      runningThresholdMs,
      inactiveThresholdMs: activity.inactiveThresholdMs,
    },
  });
};
