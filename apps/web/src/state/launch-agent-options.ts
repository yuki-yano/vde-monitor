import type { LaunchAgent, LaunchCommandResponse, LaunchConfig } from "@vde-monitor/shared";

export type LaunchAgentRequestOptions = {
  windowName?: string;
  cwd?: string;
  agentOptions?: string[];
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing?: boolean;
  resumeSessionId?: string;
  resumeFromPaneId?: string;
  resumePolicy?: "required" | "best_effort";
};

export type LaunchAgentHandler = (
  sessionName: string,
  agent: LaunchAgent,
  options?: LaunchAgentRequestOptions,
) => Promise<void | LaunchCommandResponse> | void | LaunchCommandResponse;

export const isFailedLaunchResponse = (
  value: void | LaunchCommandResponse,
): value is Extract<LaunchCommandResponse, { ok: false }> => {
  return !!value && typeof value === "object" && "ok" in value && value.ok === false;
};

export const defaultLaunchConfig: LaunchConfig = {
  agents: {
    codex: { options: [] },
    claude: { options: [] },
  },
};
