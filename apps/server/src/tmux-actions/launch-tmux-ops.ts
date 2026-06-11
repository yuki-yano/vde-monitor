import type {
  ApiError,
  LaunchAgent,
  LaunchRollback,
  LaunchVerification,
} from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";
import { firstNonEmptyLine, nonEmptyLines } from "./stdout-utils";

import { buildError } from "../errors";
import type { ActionOutcome, ActionResult } from "./action-results";
import { sleep } from "../async-utils";
import { buildLaunchCommandLine, quoteShellValue } from "./launch-command";
import { readProcessCommandByPid, resolveAgentPidFromPaneTree } from "./process-tree";

export { buildLaunchCommandLine, quoteShellValue } from "./launch-command";

const LAUNCH_VERIFY_INTERVAL_MS = 200;
const LAUNCH_VERIFY_MAX_ATTEMPTS = 5;
const AGENT_TERMINATE_WAIT_MS = 500;

const isTmuxTargetMissing = (message: string) =>
  /can't find pane|can't find window|no such pane|no such window|invalid pane|invalid window/i.test(
    message,
  );

type PaneCommandResult = ActionOutcome<{ command: string | null }>;
type PaneCurrentPathResult = ActionOutcome<{ cwd: string }>;

const readPaneCurrentCommand = async ({
  adapter,
  paneId,
}: {
  adapter: TmuxAdapter;
  paneId: string;
}): Promise<PaneCommandResult> => {
  const viaDisplay = await adapter.run([
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{pane_current_command}",
  ]);
  if (viaDisplay.exitCode === 0) {
    const displayCommand = firstNonEmptyLine(viaDisplay.stdout);
    if (displayCommand) {
      return { ok: true, command: displayCommand };
    }
  } else {
    const message = viaDisplay.stderr || "failed to resolve pane command";
    if (isTmuxTargetMissing(message)) {
      return { ok: false, error: buildError("INVALID_PANE", message) };
    }
  }

  const viaList = await adapter.run(["list-panes", "-t", paneId, "-F", "#{pane_current_command}"]);
  if (viaList.exitCode !== 0) {
    const message = viaList.stderr || "failed to resolve pane command";
    return {
      ok: false,
      error: buildError(isTmuxTargetMissing(message) ? "INVALID_PANE" : "INTERNAL", message),
    };
  }
  const command = firstNonEmptyLine(viaList.stdout);
  return { ok: true, command };
};

const readPanePid = async ({
  adapter,
  paneId,
}: {
  adapter: TmuxAdapter;
  paneId: string;
}): Promise<ActionOutcome<{ panePid: number }>> => {
  const resolved = await adapter.run(["display-message", "-p", "-t", paneId, "#{pane_pid}"]);
  if (resolved.exitCode !== 0) {
    const message = resolved.stderr || "failed to resolve pane pid";
    return {
      ok: false,
      error: buildError(isTmuxTargetMissing(message) ? "INVALID_PANE" : "INTERNAL", message),
    };
  }
  const rawPid = firstNonEmptyLine(resolved.stdout) ?? "";
  const panePid = Number.parseInt(rawPid, 10);
  if (Number.isNaN(panePid) || panePid <= 0) {
    return { ok: false, error: buildError("INTERNAL", "invalid pane pid") };
  }
  return { ok: true, panePid };
};

const terminateAgentProcessIfRunning = async ({
  adapter,
  paneId,
  agent,
}: {
  adapter: TmuxAdapter;
  paneId: string;
  agent: LaunchAgent;
}): Promise<ApiError | null> => {
  const current = await readPaneCurrentCommand({ adapter, paneId });
  if (!current.ok) {
    return current.error;
  }
  if (current.command !== agent) {
    return null;
  }

  const panePidResult = await readPanePid({ adapter, paneId });
  if (!panePidResult.ok) {
    return panePidResult.error;
  }
  const agentPid = await resolveAgentPidFromPaneTree({
    panePid: panePidResult.panePid,
    agent,
  });
  if (!agentPid) {
    return buildError("INTERNAL", `failed to resolve running ${agent} process pid`);
  }

  try {
    process.kill(agentPid, "SIGTERM");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `failed to send SIGTERM to ${agent} process`;
    if (!/ESRCH/.test(message)) {
      return buildError("INTERNAL", message);
    }
  }
  await sleep(AGENT_TERMINATE_WAIT_MS);

  const afterTerm = await readPaneCurrentCommand({ adapter, paneId });
  if (!afterTerm.ok) {
    return afterTerm.error;
  }
  if (afterTerm.command !== agent) {
    return null;
  }
  const afterTermAgentCommand = await readProcessCommandByPid(agentPid);
  if (afterTermAgentCommand !== agent) {
    return null;
  }

  try {
    process.kill(agentPid, "SIGKILL");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `failed to send SIGKILL to ${agent} process`;
    if (!/ESRCH/.test(message)) {
      return buildError("INTERNAL", message);
    }
  }
  await sleep(AGENT_TERMINATE_WAIT_MS);

  const afterKill = await readPaneCurrentCommand({ adapter, paneId });
  if (!afterKill.ok) {
    return afterKill.error;
  }
  if (afterKill.command !== agent) {
    return null;
  }
  const afterKillAgentCommand = await readProcessCommandByPid(agentPid);
  if (afterKillAgentCommand === agent) {
    return buildError("INTERNAL", `failed to terminate existing ${agent} process`);
  }
  return null;
};

export const assertSessionExists = async (
  adapter: TmuxAdapter,
  sessionName: string,
): Promise<ApiError | null> => {
  const result = await adapter.run(["has-session", "-t", sessionName]);
  if (result.exitCode !== 0) {
    return buildError("NOT_FOUND", `session not found: ${sessionName}`);
  }
  return null;
};

export const resolveUniqueWindowName = async ({
  adapter,
  sessionName,
  requestedName,
  agent,
}: {
  adapter: TmuxAdapter;
  sessionName: string;
  requestedName?: string;
  agent: LaunchAgent;
}): Promise<ActionOutcome<{ windowName: string }>> => {
  const baseName = requestedName ?? `${agent}-work`;
  const listed = await adapter.run(["list-windows", "-t", sessionName, "-F", "#{window_name}"]);
  if (listed.exitCode !== 0) {
    return {
      ok: false,
      error: buildError("INTERNAL", listed.stderr || "failed to list windows"),
    };
  }
  const existingNames = new Set(nonEmptyLines(listed.stdout));

  if (!existingNames.has(baseName)) {
    return { ok: true, windowName: baseName };
  }

  for (let suffix = 2; suffix <= 10_000; suffix += 1) {
    const candidate = `${baseName}-${suffix}`;
    if (!existingNames.has(candidate)) {
      return { ok: true, windowName: candidate };
    }
  }

  return {
    ok: false,
    error: buildError("INTERNAL", "failed to resolve unique window name"),
  };
};

export const createDetachedWindow = async ({
  adapter,
  sessionName,
  windowName,
  cwd,
}: {
  adapter: TmuxAdapter;
  sessionName: string;
  windowName: string;
  cwd?: string;
}): Promise<
  | {
      ok: true;
      windowId: string;
      windowIndex: number;
      windowName: string;
      paneId: string;
    }
  | { ok: false; error: ApiError }
> => {
  const args = [
    "new-window",
    "-d",
    "-P",
    "-F",
    "#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}",
    "-t",
    sessionName,
    "-n",
    windowName,
  ];
  if (cwd) {
    args.push("-c", cwd);
  }
  const created = await adapter.run(args);
  if (created.exitCode !== 0) {
    return {
      ok: false,
      error: buildError("INTERNAL", created.stderr || "failed to create tmux window"),
    };
  }
  const firstLine = firstNonEmptyLine(created.stdout) ?? "";
  const [windowId, indexRaw, resolvedWindowName, paneId] = firstLine.split("\t");
  if (!windowId || !indexRaw || !resolvedWindowName || !paneId) {
    return {
      ok: false,
      error: buildError("INTERNAL", "unexpected tmux new-window output"),
    };
  }
  const windowIndex = Number.parseInt(indexRaw, 10);
  if (Number.isNaN(windowIndex)) {
    return {
      ok: false,
      error: buildError("INTERNAL", "invalid tmux window index"),
    };
  }
  return {
    ok: true,
    windowId,
    windowIndex,
    windowName: resolvedWindowName,
    paneId,
  };
};

export const resolveExistingPaneLaunchTarget = async ({
  adapter,
  paneId,
}: {
  adapter: TmuxAdapter;
  paneId: string;
}): Promise<
  | {
      ok: true;
      windowId: string;
      windowIndex: number;
      windowName: string;
      paneId: string;
    }
  | { ok: false; error: ApiError }
> => {
  const listed = await adapter.run([
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}",
  ]);
  if (listed.exitCode !== 0) {
    const message = listed.stderr || "failed to resolve target pane";
    return {
      ok: false,
      error: buildError(isTmuxTargetMissing(message) ? "INVALID_PANE" : "INTERNAL", message),
    };
  }
  const firstLine = firstNonEmptyLine(listed.stdout) ?? "";
  const [windowId, indexRaw, windowName, resolvedPaneId] = firstLine.split("\t");
  if (!windowId || !indexRaw || !windowName || !resolvedPaneId) {
    return {
      ok: false,
      error: buildError("INTERNAL", "unexpected tmux display-message output"),
    };
  }
  const windowIndex = Number.parseInt(indexRaw, 10);
  if (Number.isNaN(windowIndex)) {
    return {
      ok: false,
      error: buildError("INTERNAL", "invalid tmux window index"),
    };
  }
  return {
    ok: true,
    windowId,
    windowIndex,
    windowName,
    paneId: resolvedPaneId,
  };
};

export const resolvePaneCurrentPath = async ({
  adapter,
  paneId,
}: {
  adapter: TmuxAdapter;
  paneId: string;
}): Promise<PaneCurrentPathResult> => {
  const viaDisplay = await adapter.run([
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{pane_current_path}",
  ]);
  if (viaDisplay.exitCode === 0) {
    const displayPath = firstNonEmptyLine(viaDisplay.stdout);
    if (displayPath) {
      return { ok: true, cwd: displayPath };
    }
  } else {
    const message = viaDisplay.stderr || "failed to resolve pane current path";
    if (isTmuxTargetMissing(message)) {
      return { ok: false, error: buildError("INVALID_PANE", message) };
    }
  }

  const viaList = await adapter.run(["list-panes", "-t", paneId, "-F", "#{pane_current_path}"]);
  if (viaList.exitCode !== 0) {
    const message = viaList.stderr || "failed to resolve pane current path";
    return {
      ok: false,
      error: buildError(isTmuxTargetMissing(message) ? "INVALID_PANE" : "INTERNAL", message),
    };
  }
  const resolvedPath = firstNonEmptyLine(viaList.stdout);
  if (!resolvedPath) {
    return {
      ok: false,
      error: buildError("INTERNAL", "failed to resolve pane current path"),
    };
  }
  return { ok: true, cwd: resolvedPath };
};

export const interruptPaneForRelaunch = async ({
  adapter,
  paneId,
  agent,
  exitCopyModeIfNeeded,
}: {
  adapter: TmuxAdapter;
  paneId: string;
  agent: LaunchAgent;
  exitCopyModeIfNeeded: (paneId: string) => Promise<void>;
}): Promise<ApiError | null> => {
  await exitCopyModeIfNeeded(paneId);
  return terminateAgentProcessIfRunning({ adapter, paneId, agent });
};

export const sendLaunchCommand = async ({
  adapter,
  paneId,
  agent,
  options,
  resumeSessionId,
  resumePrompt,
  finalCwd,
  exitCopyModeIfNeeded,
  sendEnterKey,
  internalError,
  skipExitCopyMode = false,
  forceShellCwdPrefix = false,
}: {
  adapter: TmuxAdapter;
  paneId: string;
  agent: LaunchAgent;
  options: string[];
  resumeSessionId?: string;
  resumePrompt?: string;
  finalCwd?: string;
  exitCopyModeIfNeeded: (paneId: string) => Promise<void>;
  sendEnterKey: (paneId: string) => Promise<ActionResult>;
  internalError: (message: string) => ActionResult;
  skipExitCopyMode?: boolean;
  forceShellCwdPrefix?: boolean;
}) => {
  if (!skipExitCopyMode) {
    await exitCopyModeIfNeeded(paneId);
  }
  const commandLine = buildLaunchCommandLine({
    agent,
    options,
    resumeSessionId,
    resumePrompt,
    finalCwd,
    alwaysPrefixCwd: forceShellCwdPrefix,
  });
  const sendResult = await adapter.run(["send-keys", "-l", "-t", paneId, "--", commandLine]);
  if (sendResult.exitCode !== 0) {
    return internalError(sendResult.stderr || "send-keys launch command failed");
  }
  return sendEnterKey(paneId);
};

export const sendClaudeWorktreeCdCommand = async ({
  adapter,
  paneId,
  worktreePath,
  exitCopyModeIfNeeded,
  sendEnterKey,
  internalError,
  skipExitCopyMode = false,
}: {
  adapter: TmuxAdapter;
  paneId: string;
  worktreePath: string;
  exitCopyModeIfNeeded: (paneId: string) => Promise<void>;
  sendEnterKey: (paneId: string) => Promise<ActionResult>;
  internalError: (message: string) => ActionResult;
  skipExitCopyMode?: boolean;
}) => {
  if (!skipExitCopyMode) {
    await exitCopyModeIfNeeded(paneId);
  }
  const commandLine = `!cd ${quoteShellValue(worktreePath)}`;
  const sendResult = await adapter.run(["send-keys", "-l", "-t", paneId, "--", commandLine]);
  if (sendResult.exitCode !== 0) {
    return internalError(sendResult.stderr || "send-keys claude worktree cd command failed");
  }
  return sendEnterKey(paneId);
};

export const verifyLaunch = async ({
  adapter,
  paneId,
  agent,
}: {
  adapter: TmuxAdapter;
  paneId: string;
  agent: LaunchAgent;
}): Promise<LaunchVerification> => {
  let observedCommand: string | null = null;

  for (let attempt = 1; attempt <= LAUNCH_VERIFY_MAX_ATTEMPTS; attempt += 1) {
    const result = await adapter.run(["list-panes", "-t", paneId, "-F", "#{pane_current_command}"]);
    if (result.exitCode === 0) {
      const currentCommand = firstNonEmptyLine(result.stdout);
      observedCommand = currentCommand;
      if (currentCommand === agent) {
        return {
          status: "verified",
          observedCommand: currentCommand,
          attempts: attempt,
        };
      }
    }

    if (attempt < LAUNCH_VERIFY_MAX_ATTEMPTS) {
      await sleep(LAUNCH_VERIFY_INTERVAL_MS);
    }
  }

  if (observedCommand) {
    return {
      status: "mismatch",
      observedCommand,
      attempts: LAUNCH_VERIFY_MAX_ATTEMPTS,
    };
  }
  return {
    status: "timeout",
    observedCommand: null,
    attempts: LAUNCH_VERIFY_MAX_ATTEMPTS,
  };
};

export const rollbackCreatedWindow = async (
  adapter: TmuxAdapter,
  windowId: string,
): Promise<LaunchRollback> => {
  const result = await adapter.run(["kill-window", "-t", windowId]);
  if (result.exitCode === 0) {
    return { attempted: true, ok: true };
  }
  return {
    attempted: true,
    ok: false,
    message: result.stderr || "failed to rollback created window",
  };
};
