import type {
  ApiError,
  LaunchAgent,
  LaunchRollback,
  LaunchVerification,
} from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";
import { execa } from "execa";

import { buildError } from "../errors";
import type { ActionResult } from "./action-results";

const LAUNCH_VERIFY_INTERVAL_MS = 200;
const LAUNCH_VERIFY_MAX_ATTEMPTS = 5;
const AGENT_TERMINATE_WAIT_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isTmuxTargetMissing = (message: string) =>
  /can't find pane|can't find window|no such pane|no such window|invalid pane|invalid window/i.test(
    message,
  );

export const quoteShellValue = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

type PaneCommandResult = { ok: true; command: string | null } | { ok: false; error: ApiError };
type ShellFragment = string;

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
    const displayCommand =
      viaDisplay.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null;
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
  const command =
    viaList.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null;
  return { ok: true, command };
};

const readPanePid = async ({
  adapter,
  paneId,
}: {
  adapter: TmuxAdapter;
  paneId: string;
}): Promise<{ ok: true; panePid: number } | { ok: false; error: ApiError }> => {
  const resolved = await adapter.run(["display-message", "-p", "-t", paneId, "#{pane_pid}"]);
  if (resolved.exitCode !== 0) {
    const message = resolved.stderr || "failed to resolve pane pid";
    return {
      ok: false,
      error: buildError(isTmuxTargetMissing(message) ? "INVALID_PANE" : "INTERNAL", message),
    };
  }
  const rawPid =
    resolved.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const panePid = Number.parseInt(rawPid, 10);
  if (Number.isNaN(panePid) || panePid <= 0) {
    return { ok: false, error: buildError("INTERNAL", "invalid pane pid") };
  }
  return { ok: true, panePid };
};

type ProcessTreeEntry = {
  pid: number;
  ppid: number;
  command: string;
};

const parseProcessTreeEntry = (line: string): ProcessTreeEntry | null => {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const pid = Number.parseInt(match[1] ?? "", 10);
  const ppid = Number.parseInt(match[2] ?? "", 10);
  const command = (match[3] ?? "").trim();
  if (Number.isNaN(pid) || Number.isNaN(ppid) || !command) {
    return null;
  }
  return { pid, ppid, command };
};

const resolveAgentPidFromPaneTree = async ({
  panePid,
  agent,
}: {
  panePid: number;
  agent: LaunchAgent;
}): Promise<number | null> => {
  let processList: Awaited<ReturnType<typeof execa>>;
  try {
    processList = await execa("ps", ["-ax", "-o", "pid=,ppid=,comm="], {
      reject: false,
      timeout: 2000,
      maxBuffer: 2_000_000,
    });
  } catch {
    return null;
  }
  if (processList.exitCode !== 0) {
    return null;
  }
  const stdout = typeof processList.stdout === "string" ? processList.stdout : "";
  if (!stdout) {
    return null;
  }

  const entriesByPid = new Map<number, ProcessTreeEntry>();
  const childrenByParent = new Map<number, ProcessTreeEntry[]>();
  stdout
    .split(/\r?\n/)
    .map((line) => parseProcessTreeEntry(line))
    .filter((entry): entry is ProcessTreeEntry => entry != null)
    .forEach((entry) => {
      entriesByPid.set(entry.pid, entry);
      const children = childrenByParent.get(entry.ppid) ?? [];
      children.push(entry);
      childrenByParent.set(entry.ppid, children);
    });

  const descendants = new Set<number>();
  const stack = [panePid];
  while (stack.length > 0) {
    const currentPid = stack.pop();
    if (currentPid == null) {
      continue;
    }
    const children = childrenByParent.get(currentPid) ?? [];
    for (const child of children) {
      if (descendants.has(child.pid)) {
        continue;
      }
      descendants.add(child.pid);
      stack.push(child.pid);
    }
  }

  const agentCandidates = Array.from(descendants)
    .map((pid) => entriesByPid.get(pid) ?? null)
    .filter((entry): entry is ProcessTreeEntry => entry != null)
    .filter((entry) => entry.command === agent)
    .sort((a, b) => b.pid - a.pid);

  return agentCandidates[0]?.pid ?? null;
};

const readProcessCommandByPid = async (pid: number): Promise<string | null> => {
  if (pid <= 0) {
    return null;
  }
  let resolved: Awaited<ReturnType<typeof execa>>;
  try {
    resolved = await execa("ps", ["-p", String(pid), "-o", "comm="], {
      reject: false,
      timeout: 2000,
      maxBuffer: 100_000,
    });
  } catch {
    return null;
  }
  if (resolved.exitCode !== 0) {
    return null;
  }
  const stdout = typeof resolved.stdout === "string" ? resolved.stdout : "";
  if (!stdout) {
    return null;
  }
  const command =
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null;
  return command;
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

export const buildLaunchCommandLine = ({
  agent,
  options,
  resumeSessionId,
  finalCwd,
  alwaysPrefixCwd = false,
}: {
  agent: LaunchAgent;
  // Each option must already be a validated shell fragment.
  options: ShellFragment[];
  resumeSessionId?: string;
  finalCwd?: string;
  alwaysPrefixCwd?: boolean;
}) => {
  const optionsSuffix = options.join(" ").trim();
  if (!resumeSessionId) {
    const launchCommand = [agent, ...options].join(" ");
    if (!finalCwd || !alwaysPrefixCwd) {
      return launchCommand;
    }
    return `cd ${quoteShellValue(finalCwd)} && ${launchCommand}`;
  }
  const quotedSessionId = quoteShellValue(resumeSessionId);
  const resumeBase =
    agent === "codex" ? `codex resume ${quotedSessionId}` : `claude --resume ${quotedSessionId}`;
  const resumeCommand = optionsSuffix.length > 0 ? `${resumeBase} ${optionsSuffix}` : resumeBase;
  if (!finalCwd) {
    return resumeCommand;
  }
  return `cd ${quoteShellValue(finalCwd)} && ${resumeCommand}`;
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
}): Promise<{ ok: true; windowName: string } | { ok: false; error: ApiError }> => {
  const baseName = requestedName ?? `${agent}-work`;
  const listed = await adapter.run(["list-windows", "-t", sessionName, "-F", "#{window_name}"]);
  if (listed.exitCode !== 0) {
    return {
      ok: false,
      error: buildError("INTERNAL", listed.stderr || "failed to list windows"),
    };
  }
  const existingNames = new Set(
    listed.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

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
  const firstLine = created.stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
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
  const firstLine = listed.stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
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
    finalCwd,
    alwaysPrefixCwd: forceShellCwdPrefix,
  });
  const sendResult = await adapter.run(["send-keys", "-l", "-t", paneId, "--", commandLine]);
  if (sendResult.exitCode !== 0) {
    return internalError(sendResult.stderr || "send-keys launch command failed");
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
      const currentCommand =
        result.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? null;
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
