import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  AgentMonitorConfig,
  LaunchAgentInSessionInput,
  MultiplexerLaunchCapability,
  MultiplexerLaunchResult,
  MultiplexerLaunchRollback,
  MultiplexerLaunchVerification,
} from "@vde-monitor/multiplexer";
import type { ApiError, LaunchAgent } from "@vde-monitor/shared";

import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

const execFileAsync = promisify(execFile);
const LAUNCH_VERIFY_MAX_ATTEMPTS = 5;
const LAUNCH_VERIFY_INTERVAL_MS = 400;

export type HerdrCommandRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;
export type HerdrExecutableResolver = (agent: LaunchAgent) => Promise<string[]>;
export type HerdrVwRunner = (
  args: string[],
  options: { cwd: string; timeoutMs?: number },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

type HerdrWorkspace = {
  workspace_id?: unknown;
  label?: unknown;
};

type WorkspaceListResult = {
  workspaces?: HerdrWorkspace[];
};

type HerdrAgentStartOutput = {
  result?: {
    agent?: {
      pane_id?: unknown;
      tab_id?: unknown;
      workspace_id?: unknown;
    };
  };
};

type PaneGetResult = {
  pane?: {
    pane_id?: unknown;
    tab_id?: unknown;
    agent?: unknown;
  };
};

type HerdrPane = {
  workspace_id?: unknown;
  cwd?: unknown;
  foreground_cwd?: unknown;
};

type PaneListResult = {
  panes?: HerdrPane[];
};

type VwWorktreeEntry = {
  path: string;
  branch: string | null;
};

type VwWorktreeSnapshot = {
  repoRoot: string | null;
  entries: VwWorktreeEntry[];
};

const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const buildError = (code: ApiError["code"], message: string): ApiError => ({ code, message });

const defaultRollback = (): MultiplexerLaunchRollback => ({ attempted: false, ok: true });

const launchError = (error: ApiError): MultiplexerLaunchResult => ({
  ok: false,
  error,
  rollback: defaultRollback(),
});

const normalizeOptionalText = (value?: string) => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const containsInvalidText = (value: string) =>
  value.includes("\0") || value.includes("\r") || value.includes("\n") || value.includes("\t");

const normalizeLaunchOptions = (options?: string[]) =>
  options?.filter((option) => option.trim().length > 0);

const validateLaunchOptions = (options: string[] | undefined): ApiError | null => {
  if (!options) return null;
  if (options.some((option) => option.length > 256 || containsInvalidText(option))) {
    return buildError("INVALID_PAYLOAD", "agent options include an invalid value");
  }
  return null;
};

const resolveConfiguredLaunchOptions = ({
  config,
  agent,
  optionsOverride,
}: {
  config?: Pick<AgentMonitorConfig, "launch">;
  agent: LaunchAgent;
  optionsOverride?: string[];
}) => {
  return normalizeLaunchOptions(optionsOverride ?? config?.launch.agents[agent].options) ?? [];
};

const toStringValue = (value: unknown): string | null => (typeof value === "string" ? value : null);

const normalizeAbsolutePath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const resolved = path.resolve(value);
  const normalized = resolved.replace(/[\\/]+$/, "");
  return normalized.length > 0 ? normalized : path.sep;
};

const normalizePathValue = (value: string): string =>
  normalizeAbsolutePath(value) ?? normalizeAbsolutePath(process.cwd()) ?? process.cwd();

const extractOrdinal = (value: string, marker: string): number => {
  const markerIndex = value.lastIndexOf(marker);
  if (markerIndex < 0) return 0;
  const parsed = Number.parseInt(value.slice(markerIndex + marker.length), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const findWorkspace = async (client: HerdrRequester, sessionName: string) => {
  const result = await client.request<WorkspaceListResult>(HERDR_METHODS.workspaceList, {});
  return (result.workspaces ?? []).find((workspace) => {
    return workspace.workspace_id === sessionName || workspace.label === sessionName;
  });
};

const resolveSessionSnapshotCwd = async ({
  client,
  workspaceId,
}: {
  client: HerdrRequester;
  workspaceId: string;
}): Promise<{ ok: true; cwd: string } | { ok: false; error: ApiError }> => {
  const result = await client.request<PaneListResult>(HERDR_METHODS.paneList, {});
  const pane = (result.panes ?? []).find((candidate) => candidate.workspace_id === workspaceId);
  const cwd = toStringValue(pane?.foreground_cwd) ?? toStringValue(pane?.cwd);
  if (!cwd) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", "failed to resolve workspace current path"),
    };
  }
  return { ok: true, cwd };
};

const parseVwSnapshot = (stdout: string): VwWorktreeSnapshot | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const payload = parsed as { status?: unknown; repoRoot?: unknown; worktrees?: unknown };
  if (payload.status !== "ok" || !Array.isArray(payload.worktrees)) {
    return null;
  }
  const entries = payload.worktrees
    .map((item): VwWorktreeEntry | null => {
      if (!item || typeof item !== "object") return null;
      const worktree = item as { path?: unknown; branch?: unknown };
      const normalizedPath = normalizeAbsolutePath(toStringValue(worktree.path));
      if (!normalizedPath) return null;
      return {
        path: normalizedPath,
        branch: toStringValue(worktree.branch),
      };
    })
    .filter((entry): entry is VwWorktreeEntry => entry != null)
    .sort((a, b) => b.path.length - a.path.length);
  return {
    repoRoot: normalizeAbsolutePath(toStringValue(payload.repoRoot)),
    entries,
  };
};

const resolveWorktreeCwd = async ({
  client,
  runVw,
  workspaceId,
  worktreePath,
  worktreeBranch,
  worktreeCreateIfMissing,
}: {
  client: HerdrRequester;
  runVw: HerdrVwRunner;
  workspaceId: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing: boolean;
}): Promise<{ ok: true; cwd?: string } | { ok: false; error: ApiError }> => {
  if (!worktreePath && !worktreeBranch && !worktreeCreateIfMissing) {
    return { ok: true, cwd: undefined };
  }

  const snapshotCwd = await resolveSessionSnapshotCwd({ client, workspaceId });
  if (!snapshotCwd.ok) {
    return snapshotCwd;
  }

  const listed = await runVw(["list", "--json", "--no-gh"], {
    cwd: snapshotCwd.cwd,
    timeoutMs: 4000,
  });
  const snapshot = listed.exitCode === 0 ? parseVwSnapshot(listed.stdout.trim()) : null;
  if (!snapshot) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", "vw worktree snapshot is unavailable"),
    };
  }

  const normalizedPath = worktreePath ? normalizePathValue(worktreePath) : undefined;
  const matchedByPath = normalizedPath
    ? (snapshot.entries.find((entry) => normalizePathValue(entry.path) === normalizedPath) ?? null)
    : null;
  if (normalizedPath && !matchedByPath) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", `worktree path not found: ${normalizedPath}`),
    };
  }

  const matchedByBranch = worktreeBranch
    ? (snapshot.entries.find((entry) => entry.branch === worktreeBranch) ?? null)
    : null;
  if (worktreeBranch && !matchedByBranch && !worktreeCreateIfMissing) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", `worktree branch not found: ${worktreeBranch}`),
    };
  }

  if (matchedByPath && matchedByBranch && matchedByPath.path !== matchedByBranch.path) {
    return {
      ok: false,
      error: buildError(
        "INVALID_PAYLOAD",
        "worktreePath and worktreeBranch resolved to different worktrees",
      ),
    };
  }

  if (worktreeBranch && !matchedByBranch && worktreeCreateIfMissing) {
    const repoRoot = snapshot.repoRoot ? normalizePathValue(snapshot.repoRoot) : null;
    if (!repoRoot) {
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", "repo root is unavailable for vw worktree creation"),
      };
    }

    const currentBranch = await runVw(["branch", "--show-current"], {
      cwd: repoRoot,
      timeoutMs: 5000,
    });
    const previousBranch =
      currentBranch.exitCode === 0 ? normalizeOptionalText(currentBranch.stdout) : undefined;
    const rollbackSwitchedBranch = async () => {
      if (!previousBranch || previousBranch === worktreeBranch) {
        return;
      }
      await runVw(["switch", previousBranch], { cwd: repoRoot, timeoutMs: 15_000 });
    };

    const switched = await runVw(["switch", worktreeBranch], {
      cwd: repoRoot,
      timeoutMs: 15_000,
    });
    if (switched.exitCode !== 0) {
      const message = (switched.stderr || switched.stdout || "vw switch failed").trim();
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", `vw switch failed: ${message}`),
      };
    }

    const resolvedPath = await runVw(["path", worktreeBranch], {
      cwd: repoRoot,
      timeoutMs: 5000,
    });
    if (resolvedPath.exitCode !== 0) {
      await rollbackSwitchedBranch();
      const message = (resolvedPath.stderr || resolvedPath.stdout || "vw path failed").trim();
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", `vw path failed: ${message}`),
      };
    }

    const nextCwd = normalizeOptionalText(resolvedPath.stdout);
    if (!nextCwd) {
      await rollbackSwitchedBranch();
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", "vw path returned an empty path"),
      };
    }
    return { ok: true, cwd: normalizePathValue(nextCwd) };
  }

  return { ok: true, cwd: matchedByPath?.path ?? matchedByBranch?.path };
};

const buildAgentArgv = ({
  agent,
  executableArgv,
  options,
  resumeSessionId,
}: {
  agent: LaunchAgent;
  executableArgv: string[];
  options: string[];
  resumeSessionId?: string;
}) => {
  if (!resumeSessionId) {
    return [...executableArgv, ...options];
  }
  if (agent === "codex") {
    return [...executableArgv, "resume", resumeSessionId, ...options];
  }
  return [...executableArgv, "--resume", resumeSessionId, ...options];
};

const parseAgentStartOutput = (stdout: string): { paneId: string; tabId: string } | ApiError => {
  try {
    const parsed = JSON.parse(stdout) as HerdrAgentStartOutput;
    const paneId = toStringValue(parsed.result?.agent?.pane_id);
    const tabId = toStringValue(parsed.result?.agent?.tab_id);
    if (!paneId || !tabId) {
      return buildError("INTERNAL", "unexpected herdr agent start output");
    }
    return { paneId, tabId };
  } catch {
    return buildError("INTERNAL", "failed to parse herdr agent start output");
  }
};

const verifyLaunch = async ({
  client,
  paneId,
  agent,
}: {
  client: HerdrRequester;
  paneId: string;
  agent: LaunchAgent;
}): Promise<MultiplexerLaunchVerification> => {
  let observedCommand: string | null = null;

  for (let attempt = 1; attempt <= LAUNCH_VERIFY_MAX_ATTEMPTS; attempt += 1) {
    const result = await client.request<PaneGetResult>(HERDR_METHODS.paneGet, { pane_id: paneId });
    const observed = toStringValue(result.pane?.agent);
    if (observed) {
      observedCommand = observed;
    }
    if (observed === agent) {
      return { status: "verified", observedCommand: observed, attempts: attempt };
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

const defaultRunCommand: HerdrCommandRunner = async (args) => {
  const result = await execFileAsync("herdr", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const defaultRunVw: HerdrVwRunner = async (args, options) => {
  return await new Promise((resolve) => {
    execFile(
      "vw",
      args,
      {
        cwd: options.cwd,
        encoding: "utf8",
        timeout: options.timeoutMs,
        maxBuffer: 2_000_000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode:
            error && typeof (error as { code?: unknown }).code === "number"
              ? (error as { code: number }).code
              : 0,
        });
      },
    );
  });
};

const defaultResolveExecutable: HerdrExecutableResolver = async (agent) => {
  let executable: string = agent;
  try {
    const result = await execFileAsync("which", [agent], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    executable = result.stdout.trim() || agent;
  } catch {
    return [agent];
  }
  const prefix = await readFile(executable, "utf8")
    .then((content) => content.slice(0, 80))
    .catch(() => "");
  if (prefix.startsWith("#!/usr/bin/env node")) {
    const scriptPath = await realpath(executable).catch(() => executable);
    return [process.execPath, scriptPath];
  }
  return [executable];
};

export const createHerdrLaunchCapability = ({
  client,
  config,
  runCommand = defaultRunCommand,
  runVw = defaultRunVw,
  resolveExecutable = defaultResolveExecutable,
}: {
  client: HerdrRequester;
  config?: Pick<AgentMonitorConfig, "launch">;
  runCommand?: HerdrCommandRunner;
  runVw?: HerdrVwRunner;
  resolveExecutable?: HerdrExecutableResolver;
}): MultiplexerLaunchCapability => {
  const launchAgentInSession = async ({
    sessionName,
    agent,
    windowName,
    cwd,
    agentOptions,
    worktreePath,
    worktreeBranch,
    worktreeCreateIfMissing,
    resumeSessionId,
    resumeTarget,
  }: LaunchAgentInSessionInput): Promise<MultiplexerLaunchResult> => {
    const normalizedSessionName = sessionName.trim();
    if (!normalizedSessionName) {
      return launchError(buildError("INVALID_PAYLOAD", "sessionName is required"));
    }
    if (resumeTarget === "window") {
      return launchError(
        buildError("RESUME_UNSUPPORTED", "herdr launch does not support window resume"),
      );
    }

    const normalizedWindowName = normalizeOptionalText(windowName);
    if (normalizedWindowName && containsInvalidText(normalizedWindowName)) {
      return launchError(
        buildError("INVALID_PAYLOAD", "windowName must not include control characters"),
      );
    }
    const normalizedCwd = normalizeOptionalText(cwd);
    const normalizedWorktreePath = normalizeOptionalText(worktreePath);
    const normalizedWorktreeBranch = normalizeOptionalText(worktreeBranch);
    const normalizedWorktreeCreateIfMissing = worktreeCreateIfMissing === true;
    if (
      normalizedCwd &&
      (normalizedWorktreePath || normalizedWorktreeBranch || normalizedWorktreeCreateIfMissing)
    ) {
      return launchError(
        buildError(
          "INVALID_PAYLOAD",
          "cwd cannot be combined with worktreePath/worktreeBranch/worktreeCreateIfMissing",
        ),
      );
    }
    if (normalizedWorktreeCreateIfMissing && normalizedWorktreePath) {
      return launchError(
        buildError(
          "INVALID_PAYLOAD",
          "worktreePath cannot be combined with worktreeCreateIfMissing",
        ),
      );
    }
    if (normalizedWorktreeCreateIfMissing && !normalizedWorktreeBranch) {
      return launchError(
        buildError(
          "INVALID_PAYLOAD",
          "worktreeBranch is required when worktreeCreateIfMissing is true",
        ),
      );
    }

    const resolvedOptions = resolveConfiguredLaunchOptions({
      config,
      agent,
      optionsOverride: agentOptions,
    });
    const optionsError = validateLaunchOptions(resolvedOptions);
    if (optionsError) {
      return launchError(optionsError);
    }

    const workspace = await findWorkspace(client, normalizedSessionName);
    const workspaceId = toStringValue(workspace?.workspace_id);
    if (!workspaceId) {
      return launchError(buildError("NOT_FOUND", `workspace not found: ${normalizedSessionName}`));
    }

    const resolvedWorktreeCwd = await resolveWorktreeCwd({
      client,
      runVw,
      workspaceId,
      worktreePath: normalizedWorktreePath,
      worktreeBranch: normalizedWorktreeBranch,
      worktreeCreateIfMissing: normalizedWorktreeCreateIfMissing,
    });
    if (!resolvedWorktreeCwd.ok) {
      return launchError(resolvedWorktreeCwd.error);
    }

    const agentName = normalizedWindowName ?? `${agent}-work`;
    const finalCwd = normalizedCwd ?? resolvedWorktreeCwd.cwd;
    const executableArgv = await resolveExecutable(agent);
    const args = ["agent", "start", agentName, "--workspace", workspaceId];
    if (finalCwd) {
      args.push("--cwd", finalCwd);
    }
    args.push(
      "--focus",
      "--",
      ...buildAgentArgv({ agent, executableArgv, options: resolvedOptions, resumeSessionId }),
    );

    let startOutput: { paneId: string; tabId: string } | ApiError;
    try {
      const output = await runCommand(args);
      startOutput = parseAgentStartOutput(output.stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : "herdr agent start failed";
      return launchError(buildError("INTERNAL", message));
    }
    if ("code" in startOutput) {
      return launchError(startOutput);
    }

    const verification = await verifyLaunch({
      client,
      paneId: startOutput.paneId,
      agent,
    });

    return {
      ok: true,
      result: {
        sessionName: workspaceId,
        agent,
        windowId: startOutput.tabId,
        windowIndex: extractOrdinal(startOutput.tabId, ":t"),
        windowName: agentName,
        paneId: startOutput.paneId,
        launchedCommand: agent,
        resolvedOptions,
        verification,
      },
      rollback: defaultRollback(),
    };
  };

  return { launchAgentInSession };
};
