import type {
  ApiError,
  LaunchAgent,
  LaunchRollback,
  LaunchVerification,
} from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";

import { buildError } from "../errors";
import type { ActionResult } from "./action-results";

const LAUNCH_VERIFY_INTERVAL_MS = 200;
const LAUNCH_VERIFY_MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const buildLaunchCommandLine = (agent: LaunchAgent, options: string[]) =>
  [agent, ...options].join(" ");

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

export const sendLaunchCommand = async ({
  adapter,
  paneId,
  agent,
  options,
  exitCopyModeIfNeeded,
  sendEnterKey,
  internalError,
}: {
  adapter: TmuxAdapter;
  paneId: string;
  agent: LaunchAgent;
  options: string[];
  exitCopyModeIfNeeded: (paneId: string) => Promise<void>;
  sendEnterKey: (paneId: string) => Promise<ActionResult>;
  internalError: (message: string) => ActionResult;
}) => {
  await exitCopyModeIfNeeded(paneId);
  const commandLine = buildLaunchCommandLine(agent, options);
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
