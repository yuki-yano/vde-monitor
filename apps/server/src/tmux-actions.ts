import { stat } from "node:fs/promises";
import path from "node:path";

import type {
  AgentMonitorConfig,
  ApiError,
  LaunchAgent,
  LaunchAgentResult,
  LaunchCommandResponse,
  LaunchRollback,
  LaunchVerification,
  RawItem,
} from "@vde-monitor/shared";
import { allowedKeys, compileDangerPatterns, isDangerousCommand } from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";
import { execa } from "execa";

import { markPaneFocus } from "./activity-suppressor";
import { setMapEntryWithLimit } from "./cache";
import { buildError, toErrorMessage } from "./errors";
import { resolveVwWorktreeSnapshotCached } from "./monitor/vw-worktree";
import { resolveBackendApp } from "./screen/macos-app";
import { focusTerminalApp, isAppRunning } from "./screen/macos-applescript";
import { focusTmuxPane } from "./screen/tmux-geometry";

type ActionResult = { ok: true; error?: undefined } | { ok: false; error: ApiError };
type LaunchResult = LaunchCommandResponse;

export const createTmuxActions = (adapter: TmuxAdapter, config: AgentMonitorConfig) => {
  const PENDING_COMMANDS_MAX_ENTRIES = 500;
  const LAUNCH_VERIFY_INTERVAL_MS = 200;
  const LAUNCH_VERIFY_MAX_ATTEMPTS = 5;
  const GRACEFUL_TERMINATE_INTERRUPT_DELAY_MS = 120;
  const GRACEFUL_TERMINATE_EXIT_DELAY_MS = 120;
  const dangerPatterns = compileDangerPatterns(config.dangerCommandPatterns);
  const dangerKeys = new Set(config.dangerKeys);
  const allowedKeySet = new Set(allowedKeys);
  const pendingCommands = new Map<string, string>();
  const enterKey = config.input.enterKey || "C-m";
  const enterDelayMs = config.input.enterDelayMs ?? 0;
  const bracketedPaste = (value: string) => `\u001b[200~${value}\u001b[201~`;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const isTmuxTargetMissing = (message: string) =>
    /can't find pane|can't find window|no such pane|no such window|invalid pane|invalid window/i.test(
      message,
    );

  const okResult = (): ActionResult => ({ ok: true });
  const invalidPayload = (message: string): ActionResult => ({
    ok: false,
    error: buildError("INVALID_PAYLOAD", message),
  });
  const internalError = (message: string): ActionResult => ({
    ok: false,
    error: buildError("INTERNAL", message),
  });
  const dangerousCommand = (): ActionResult => ({
    ok: false,
    error: buildError("DANGEROUS_COMMAND", "dangerous command blocked"),
  });
  const dangerousKey = (): ActionResult => ({
    ok: false,
    error: buildError("DANGEROUS_COMMAND", "dangerous key blocked"),
  });
  const normalizeText = (value: string) => value.replace(/\r\n/g, "\n");
  const defaultLaunchRollback = (): LaunchRollback => ({ attempted: false, ok: true });

  const launchError = (error: ApiError, rollback: LaunchRollback): LaunchResult => ({
    ok: false,
    error,
    rollback,
  });

  const launchSuccess = (result: LaunchAgentResult): LaunchResult => ({
    ok: true,
    result,
    rollback: defaultLaunchRollback(),
  });

  const ensureTextLength = (value: string): ActionResult | null => {
    if (value.length > config.input.maxTextLength) {
      return invalidPayload("text too long");
    }
    return null;
  };

  const hasInvalidKey = (keys: string[]) => keys.some((key) => !allowedKeySet.has(key as never));

  const hasDangerKey = (keys: string[]) => keys.some((key) => dangerKeys.has(key));

  const prepareSendText = (paneId: string, text: string) => {
    const normalized = normalizeText(text);
    const pending = pendingCommands.get(paneId) ?? "";
    return { normalized, combined: `${pending}${normalized}` };
  };

  const validateSendTextInput = (text: string): ActionResult | null => {
    if (!text || text.trim().length === 0) {
      return invalidPayload("text is required");
    }
    return ensureTextLength(text);
  };

  const validateCombinedText = (paneId: string, combined: string): ActionResult | null => {
    if (combined.length > config.input.maxTextLength) {
      pendingCommands.delete(paneId);
      return invalidPayload("text too long");
    }
    if (isDangerousCommand(combined, dangerPatterns)) {
      pendingCommands.delete(paneId);
      return dangerousCommand();
    }
    return null;
  };

  const validateSendKeysInput = (keys: string[]): ActionResult | null => {
    if (keys.length === 0 || hasInvalidKey(keys)) {
      return invalidPayload("invalid keys");
    }
    if (hasDangerKey(keys)) {
      return dangerousKey();
    }
    return null;
  };

  const validateRawItems = (items: RawItem[], unsafe: boolean): ActionResult | null => {
    if (!items || items.length === 0) {
      return invalidPayload("items are required");
    }
    const keys = items.filter((item) => item.kind === "key").map((item) => item.value);
    if (hasInvalidKey(keys)) {
      return invalidPayload("invalid keys");
    }
    if (!unsafe && hasDangerKey(keys)) {
      return dangerousKey();
    }
    return null;
  };

  const exitCopyModeIfNeeded = async (paneId: string) => {
    await adapter.run([
      "if-shell",
      "-t",
      paneId,
      '[ "#{pane_in_mode}" = "1" ]',
      `copy-mode -q -t ${paneId}`,
    ]);
  };

  const sendLiteralKeys = async (paneId: string, payload: string): Promise<ActionResult> => {
    const result = await adapter.run(["send-keys", "-l", "-t", paneId, "--", payload]);
    if (result.exitCode !== 0) {
      return internalError(result.stderr || "send-keys failed");
    }
    return okResult();
  };

  const sendEnterKey = async (paneId: string): Promise<ActionResult> => {
    if (enterDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, enterDelayMs));
    }
    const result = await adapter.run(["send-keys", "-t", paneId, enterKey]);
    if (result.exitCode !== 0) {
      return internalError(result.stderr || "send-keys Enter failed");
    }
    return okResult();
  };

  const sendRawText = async (paneId: string, value: string) => {
    if (!value) {
      return okResult();
    }
    const lengthError = ensureTextLength(value);
    if (lengthError) {
      return lengthError;
    }
    const normalized = normalizeText(value);
    const payload = normalized.includes("\n") ? bracketedPaste(normalized) : normalized;
    return sendLiteralKeys(paneId, payload);
  };

  const sendRawItem = async (paneId: string, item: RawItem): Promise<ActionResult> => {
    if (item.kind === "text") {
      return sendRawText(paneId, item.value);
    }
    const result = await adapter.run(["send-keys", "-t", paneId, item.value]);
    if (result.exitCode !== 0) {
      return internalError(result.stderr || "send-keys failed");
    }
    return okResult();
  };

  const resolveTextPayload = (normalized: string) =>
    normalized.includes("\n") ? bracketedPaste(normalized) : normalized;

  const finalizePendingText = ({
    paneId,
    enter,
    normalized,
    combined,
  }: {
    paneId: string;
    enter: boolean;
    normalized: string;
    combined: string;
  }) => {
    if (enter || normalized.includes("\n")) {
      pendingCommands.delete(paneId);
      return okResult();
    }
    setMapEntryWithLimit(pendingCommands, paneId, combined, PENDING_COMMANDS_MAX_ENTRIES);
    return okResult();
  };

  const sendText = async (paneId: string, text: string, enter = true) => {
    const inputError = validateSendTextInput(text);
    if (inputError) {
      return inputError;
    }

    const prepared = prepareSendText(paneId, text);
    const combinedError = validateCombinedText(paneId, prepared.combined);
    if (combinedError) {
      return combinedError;
    }

    await exitCopyModeIfNeeded(paneId);
    const payload = resolveTextPayload(prepared.normalized);
    const sendResult = await sendLiteralKeys(paneId, payload);
    if (!sendResult.ok) {
      return sendResult;
    }

    if (enter) {
      const enterResult = await sendEnterKey(paneId);
      if (!enterResult.ok) {
        return enterResult;
      }
    }
    return finalizePendingText({
      paneId,
      enter,
      normalized: prepared.normalized,
      combined: prepared.combined,
    });
  };

  const sendKeys = async (paneId: string, keys: string[]) => {
    const validationError = validateSendKeysInput(keys);
    if (validationError) {
      return validationError;
    }
    for (const key of keys) {
      const result = await adapter.run(["send-keys", "-t", paneId, key]);
      if (result.exitCode !== 0) {
        return internalError(result.stderr || "send-keys failed");
      }
    }
    return okResult();
  };

  const sendRaw = async (paneId: string, items: RawItem[], unsafe = false) => {
    const validationError = validateRawItems(items, unsafe);
    if (validationError) {
      return validationError;
    }

    await exitCopyModeIfNeeded(paneId);
    for (const item of items) {
      const result = await sendRawItem(paneId, item);
      if (!result.ok) {
        return result;
      }
    }
    return okResult();
  };

  const resolvePaneId = (paneId: string): string | null => {
    const normalized = paneId.trim();
    return normalized.length > 0 ? normalized : null;
  };

  const gracefullyTerminatePaneSession = async (paneId: string) => {
    await exitCopyModeIfNeeded(paneId);
    await adapter.run(["send-keys", "-t", paneId, "C-c"]);
    await sleep(GRACEFUL_TERMINATE_INTERRUPT_DELAY_MS);
    await adapter.run(["send-keys", "-l", "-t", paneId, "--", "exit"]);
    await sendEnterKey(paneId);
    await sleep(GRACEFUL_TERMINATE_EXIT_DELAY_MS);
  };

  const resolveWindowIdFromPane = async (
    paneId: string,
  ): Promise<{ ok: true; windowId: string } | { ok: false; error: ApiError } | null> => {
    const listed = await adapter.run(["list-panes", "-t", paneId, "-F", "#{window_id}"]);
    if (listed.exitCode !== 0) {
      const message = listed.stderr || "failed to resolve pane window";
      if (isTmuxTargetMissing(message)) {
        return null;
      }
      return {
        ok: false,
        error: buildError("INTERNAL", message),
      };
    }
    const windowId =
      listed.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null;
    if (!windowId) {
      return {
        ok: false,
        error: buildError("INTERNAL", "failed to resolve pane window"),
      };
    }
    return { ok: true, windowId };
  };

  const killPane = async (paneId: string): Promise<ActionResult> => {
    const targetPaneId = resolvePaneId(paneId);
    if (!targetPaneId) {
      return invalidPayload("pane id is required");
    }

    await gracefullyTerminatePaneSession(targetPaneId).catch(() => null);
    const killed = await adapter.run(["kill-pane", "-t", targetPaneId]);
    if (killed.exitCode === 0 || isTmuxTargetMissing(killed.stderr || "")) {
      pendingCommands.delete(targetPaneId);
      return okResult();
    }
    return internalError(killed.stderr || "kill-pane failed");
  };

  const killWindow = async (paneId: string): Promise<ActionResult> => {
    const targetPaneId = resolvePaneId(paneId);
    if (!targetPaneId) {
      return invalidPayload("pane id is required");
    }

    const resolvedWindow = await resolveWindowIdFromPane(targetPaneId);
    if (resolvedWindow == null) {
      pendingCommands.delete(targetPaneId);
      return okResult();
    }
    if (!resolvedWindow.ok) {
      return { ok: false, error: resolvedWindow.error };
    }

    await gracefullyTerminatePaneSession(targetPaneId).catch(() => null);
    const killed = await adapter.run(["kill-window", "-t", resolvedWindow.windowId]);
    if (killed.exitCode === 0 || isTmuxTargetMissing(killed.stderr || "")) {
      pendingCommands.delete(targetPaneId);
      return okResult();
    }
    return internalError(killed.stderr || "kill-window failed");
  };

  const focusPane = async (paneId: string): Promise<ActionResult> => {
    if (!paneId) {
      return invalidPayload("pane id is required");
    }
    if (process.platform !== "darwin") {
      return invalidPayload("focus is only supported on macOS");
    }
    const app = resolveBackendApp(config.screen.image.backend);
    if (!app) {
      return invalidPayload("invalid terminal backend");
    }

    try {
      const running = await isAppRunning(app.appName);
      if (!running) {
        return {
          ok: false,
          error: buildError("TMUX_UNAVAILABLE", "Terminal is not running"),
        };
      }

      await focusTerminalApp(app.appName);
      markPaneFocus(paneId);
      await focusTmuxPane(paneId, config.tmux).catch(() => null);
      return okResult();
    } catch (error) {
      return internalError(toErrorMessage(error, "failed to focus pane"));
    }
  };

  const normalizeOptionalText = (value?: string) => {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : undefined;
  };

  const containsNulOrLineBreak = (value: string) =>
    value.includes("\0") || value.includes("\r") || value.includes("\n") || value.includes("\t");

  const validateWindowName = (value: string | undefined): ApiError | null => {
    if (!value) {
      return null;
    }
    if (containsNulOrLineBreak(value)) {
      return buildError("INVALID_PAYLOAD", "windowName must not include control characters");
    }
    return null;
  };

  const validateCwd = async (value: string | undefined): Promise<ApiError | null> => {
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

  const normalizePathValue = (value: string): string => {
    const resolved = path.resolve(value);
    const normalized = resolved.replace(/[\\/]+$/, "");
    return normalized.length > 0 ? normalized : path.sep;
  };

  const resolveSessionSnapshotCwd = async (
    sessionName: string,
  ): Promise<{ ok: true; cwd: string } | { ok: false; error: ApiError }> => {
    const listed = await adapter.run([
      "list-panes",
      "-t",
      sessionName,
      "-F",
      "#{pane_current_path}",
    ]);
    if (listed.exitCode !== 0) {
      return {
        ok: false,
        error: buildError("INTERNAL", listed.stderr || "failed to inspect session pane cwd"),
      };
    }
    const firstPath =
      listed.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null;
    if (!firstPath) {
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", "failed to resolve session current path"),
      };
    }
    return { ok: true, cwd: firstPath };
  };

  const resolveWorktreeCwd = async ({
    sessionName,
    worktreePath,
    worktreeBranch,
    worktreeCreateIfMissing,
  }: {
    sessionName: string;
    worktreePath?: string;
    worktreeBranch?: string;
    worktreeCreateIfMissing: boolean;
  }): Promise<{ ok: true; cwd?: string } | { ok: false; error: ApiError }> => {
    if (!worktreePath && !worktreeBranch && !worktreeCreateIfMissing) {
      return { ok: true, cwd: undefined };
    }

    const snapshotCwd = await resolveSessionSnapshotCwd(sessionName);
    if (!snapshotCwd.ok) {
      return snapshotCwd;
    }

    const snapshot = await resolveVwWorktreeSnapshotCached(snapshotCwd.cwd, { ghMode: "never" });
    if (!snapshot) {
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", "vw worktree snapshot is unavailable"),
      };
    }

    const normalizedPath = worktreePath ? normalizePathValue(worktreePath) : undefined;
    const matchedByPath = normalizedPath
      ? (snapshot.entries.find((entry) => normalizePathValue(entry.path) === normalizedPath) ??
        null)
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

      const currentBranch = await execa("vw", ["branch", "--show-current"], {
        cwd: repoRoot,
        reject: false,
        timeout: 5000,
        maxBuffer: 2_000_000,
      });
      const previousBranch =
        currentBranch.exitCode === 0 ? normalizeOptionalText(currentBranch.stdout) : undefined;
      const rollbackSwitchedBranch = async () => {
        if (!previousBranch || previousBranch === worktreeBranch) {
          return;
        }
        await execa("vw", ["switch", previousBranch], {
          cwd: repoRoot,
          reject: false,
          timeout: 15_000,
          maxBuffer: 2_000_000,
        });
      };

      const switched = await execa("vw", ["switch", worktreeBranch], {
        cwd: repoRoot,
        reject: false,
        timeout: 15_000,
        maxBuffer: 2_000_000,
      });
      if (switched.exitCode !== 0) {
        const message = (switched.stderr || switched.stdout || "vw switch failed").trim();
        return {
          ok: false,
          error: buildError("INVALID_PAYLOAD", `vw switch failed: ${message}`),
        };
      }

      const resolvedPath = await execa("vw", ["path", worktreeBranch], {
        cwd: repoRoot,
        reject: false,
        timeout: 5000,
        maxBuffer: 2_000_000,
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

    const resolvedCwd = matchedByPath?.path ?? matchedByBranch?.path;
    return { ok: true, cwd: resolvedCwd };
  };

  const normalizeLaunchOptions = (options?: string[]) => {
    if (!options) {
      return undefined;
    }
    return options.filter((option) => option.trim().length > 0);
  };

  const validateLaunchOptions = (options: string[] | undefined): ApiError | null => {
    if (!options) {
      return null;
    }
    if (options.some((option) => option.length > 256 || containsNulOrLineBreak(option))) {
      return buildError("INVALID_PAYLOAD", "agent options include an invalid value");
    }
    return null;
  };

  const resolveConfiguredLaunchOptions = (agent: LaunchAgent, optionsOverride?: string[]) => {
    const sourceOptions = optionsOverride ?? config.launch.agents[agent].options ?? [];
    return sourceOptions.filter((option) => option.trim().length > 0);
  };

  const buildLaunchCommandLine = (agent: LaunchAgent, options: string[]) =>
    [agent, ...options].join(" ");

  const assertSessionExists = async (sessionName: string): Promise<ApiError | null> => {
    const result = await adapter.run(["has-session", "-t", sessionName]);
    if (result.exitCode !== 0) {
      return buildError("NOT_FOUND", `session not found: ${sessionName}`);
    }
    return null;
  };

  const resolveUniqueWindowName = async ({
    sessionName,
    requestedName,
    agent,
  }: {
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

  const createDetachedWindow = async ({
    sessionName,
    windowName,
    cwd,
  }: {
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

  const sendLaunchCommand = async ({
    paneId,
    agent,
    options,
  }: {
    paneId: string;
    agent: LaunchAgent;
    options: string[];
  }): Promise<ActionResult> => {
    await exitCopyModeIfNeeded(paneId);
    const commandLine = buildLaunchCommandLine(agent, options);
    const sendResult = await adapter.run(["send-keys", "-l", "-t", paneId, "--", commandLine]);
    if (sendResult.exitCode !== 0) {
      return internalError(sendResult.stderr || "send-keys launch command failed");
    }
    return sendEnterKey(paneId);
  };

  const verifyLaunch = async ({
    paneId,
    agent,
  }: {
    paneId: string;
    agent: LaunchAgent;
  }): Promise<LaunchVerification> => {
    let observedCommand: string | null = null;

    for (let attempt = 1; attempt <= LAUNCH_VERIFY_MAX_ATTEMPTS; attempt += 1) {
      const result = await adapter.run([
        "list-panes",
        "-t",
        paneId,
        "-F",
        "#{pane_current_command}",
      ]);
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

  const rollbackCreatedWindow = async (windowId: string): Promise<LaunchRollback> => {
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

  const launchAgentInSession = async ({
    sessionName,
    agent,
    windowName,
    cwd,
    agentOptions,
    worktreePath,
    worktreeBranch,
    worktreeCreateIfMissing,
  }: {
    sessionName: string;
    agent: LaunchAgent;
    requestId?: string;
    windowName?: string;
    cwd?: string;
    agentOptions?: string[];
    worktreePath?: string;
    worktreeBranch?: string;
    worktreeCreateIfMissing?: boolean;
  }): Promise<LaunchResult> => {
    const normalizedSessionName = sessionName.trim();
    if (!normalizedSessionName) {
      return launchError(
        buildError("INVALID_PAYLOAD", "sessionName is required"),
        defaultLaunchRollback(),
      );
    }

    const normalizedWindowName = normalizeOptionalText(windowName);
    const windowNameError = validateWindowName(normalizedWindowName);
    if (windowNameError) {
      return launchError(windowNameError, defaultLaunchRollback());
    }

    const normalizedCwd = normalizeOptionalText(cwd);
    const normalizedAgentOptions = normalizeLaunchOptions(agentOptions);
    const normalizedAgentOptionsError = validateLaunchOptions(normalizedAgentOptions);
    if (normalizedAgentOptionsError) {
      return launchError(normalizedAgentOptionsError, defaultLaunchRollback());
    }
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
        defaultLaunchRollback(),
      );
    }

    if (normalizedWorktreeCreateIfMissing && normalizedWorktreePath) {
      return launchError(
        buildError(
          "INVALID_PAYLOAD",
          "worktreePath cannot be combined with worktreeCreateIfMissing",
        ),
        defaultLaunchRollback(),
      );
    }

    if (normalizedWorktreeCreateIfMissing && !normalizedWorktreeBranch) {
      return launchError(
        buildError(
          "INVALID_PAYLOAD",
          "worktreeBranch is required when worktreeCreateIfMissing is true",
        ),
        defaultLaunchRollback(),
      );
    }

    const sessionError = await assertSessionExists(normalizedSessionName);
    if (sessionError) {
      return launchError(sessionError, defaultLaunchRollback());
    }

    const resolvedWorktreeCwd = await resolveWorktreeCwd({
      sessionName: normalizedSessionName,
      worktreePath: normalizedWorktreePath,
      worktreeBranch: normalizedWorktreeBranch,
      worktreeCreateIfMissing: normalizedWorktreeCreateIfMissing,
    });
    if (!resolvedWorktreeCwd.ok) {
      return launchError(resolvedWorktreeCwd.error, defaultLaunchRollback());
    }
    const finalCwd = normalizedCwd ?? resolvedWorktreeCwd.cwd;
    const cwdError = await validateCwd(finalCwd);
    if (cwdError) {
      return launchError(cwdError, defaultLaunchRollback());
    }

    const resolvedWindowName = await resolveUniqueWindowName({
      sessionName: normalizedSessionName,
      requestedName: normalizedWindowName,
      agent,
    });
    if (!resolvedWindowName.ok) {
      return launchError(resolvedWindowName.error, defaultLaunchRollback());
    }

    const created = await createDetachedWindow({
      sessionName: normalizedSessionName,
      windowName: resolvedWindowName.windowName,
      cwd: finalCwd,
    });
    if (!created.ok) {
      return launchError(created.error, defaultLaunchRollback());
    }

    const resolvedOptions = resolveConfiguredLaunchOptions(agent, normalizedAgentOptions);
    const resolvedOptionsError = validateLaunchOptions(resolvedOptions);
    if (resolvedOptionsError) {
      const rollback = await rollbackCreatedWindow(created.windowId);
      return launchError(resolvedOptionsError, rollback);
    }
    const sendResult = await sendLaunchCommand({
      paneId: created.paneId,
      agent,
      options: resolvedOptions,
    });
    if (!sendResult.ok) {
      const rollback = await rollbackCreatedWindow(created.windowId);
      return launchError(sendResult.error, rollback);
    }

    const verification = await verifyLaunch({ paneId: created.paneId, agent });
    return launchSuccess({
      sessionName: normalizedSessionName,
      agent,
      windowId: created.windowId,
      windowIndex: created.windowIndex,
      windowName: created.windowName,
      paneId: created.paneId,
      launchedCommand: agent,
      resolvedOptions,
      verification,
    });
  };

  return { sendText, sendKeys, sendRaw, focusPane, killPane, killWindow, launchAgentInSession };
};
