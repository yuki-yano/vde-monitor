import { stat } from "node:fs/promises";

import type { AgentMonitorConfig, ApiError, LaunchAgent } from "@vde-monitor/shared";

import { buildError } from "../errors";

type ValidateLaunchInputCombinationParams = {
  cwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing: boolean;
};

export const normalizeOptionalText = (value?: string) => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

export const containsNulOrLineBreak = (value: string) =>
  value.includes("\0") || value.includes("\r") || value.includes("\n") || value.includes("\t");

export const validateWindowName = (value: string | undefined): ApiError | null => {
  if (!value) {
    return null;
  }
  if (containsNulOrLineBreak(value)) {
    return buildError("INVALID_PAYLOAD", "windowName must not include control characters");
  }
  return null;
};

export const validateCwd = async (value: string | undefined): Promise<ApiError | null> => {
  if (!value) {
    return null;
  }
  try {
    const stats = await stat(value);
    if (!stats.isDirectory()) {
      return buildError("INVALID_PAYLOAD", "cwd must be a directory");
    }
    return null;
  } catch {
    return buildError("INVALID_PAYLOAD", "cwd does not exist");
  }
};

export const normalizeLaunchOptions = (options?: string[]) => {
  if (!options) {
    return undefined;
  }
  return options.filter((option) => option.trim().length > 0);
};

export const validateLaunchOptions = (options: string[] | undefined): ApiError | null => {
  if (!options) {
    return null;
  }
  if (options.some((option) => option.length > 256 || containsNulOrLineBreak(option))) {
    return buildError("INVALID_PAYLOAD", "agent options include an invalid value");
  }
  return null;
};

export const resolveConfiguredLaunchOptions = ({
  config,
  agent,
  optionsOverride,
}: {
  config: AgentMonitorConfig;
  agent: LaunchAgent;
  optionsOverride?: string[];
}) => {
  const sourceOptions = optionsOverride ?? config.launch.agents[agent].options ?? [];
  return sourceOptions.filter((option) => option.trim().length > 0);
};

export const validateLaunchInputCombination = ({
  cwd,
  worktreePath,
  worktreeBranch,
  worktreeCreateIfMissing,
}: ValidateLaunchInputCombinationParams): ApiError | null => {
  if (cwd && (worktreePath || worktreeBranch || worktreeCreateIfMissing)) {
    return buildError(
      "INVALID_PAYLOAD",
      "cwd cannot be combined with worktreePath/worktreeBranch/worktreeCreateIfMissing",
    );
  }
  if (worktreeCreateIfMissing && worktreePath) {
    return buildError(
      "INVALID_PAYLOAD",
      "worktreePath cannot be combined with worktreeCreateIfMissing",
    );
  }
  if (worktreeCreateIfMissing && !worktreeBranch) {
    return buildError(
      "INVALID_PAYLOAD",
      "worktreeBranch is required when worktreeCreateIfMissing is true",
    );
  }
  return null;
};
