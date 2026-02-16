import type { LaunchAgent, LaunchConfig } from "@vde-monitor/shared";

export type LaunchAgentRequestOptions = {
  windowName?: string;
  cwd?: string;
  agentOptions?: string[];
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing?: boolean;
};

export type LaunchAgentHandler = (
  sessionName: string,
  agent: LaunchAgent,
  options?: LaunchAgentRequestOptions,
) => Promise<void> | void;

export const defaultLaunchConfig: LaunchConfig = {
  agents: {
    codex: { options: [] },
    claude: { options: [] },
  },
};
