import type { AgentMonitorConfig, ApiError } from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";

import { markPaneFocus } from "../activity-suppressor";
import { buildError, toErrorMessage } from "../errors";
import { resolveBackendApp } from "../screen/macos-app";
import { focusTerminalApp, isAppRunning } from "../screen/macos-applescript";
import { focusTmuxPane } from "../screen/tmux-geometry";
import type { ActionResult, ActionResultHelpers } from "./action-results";

const GRACEFUL_TERMINATE_INTERRUPT_DELAY_MS = 120;
const GRACEFUL_TERMINATE_EXIT_DELAY_MS = 120;

type CreatePaneActionsParams = {
  adapter: TmuxAdapter;
  config: AgentMonitorConfig;
  pendingCommands: Map<string, string>;
  actionResults: ActionResultHelpers;
  exitCopyModeIfNeeded: (paneId: string) => Promise<void>;
  sendEnterKey: (paneId: string) => Promise<ActionResult>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTmuxTargetMissing = (message: string) =>
  /can't find pane|can't find window|no such pane|no such window|invalid pane|invalid window/i.test(
    message,
  );

export const createPaneActions = ({
  adapter,
  config,
  pendingCommands,
  actionResults,
  exitCopyModeIfNeeded,
  sendEnterKey,
}: CreatePaneActionsParams) => {
  const { okResult, invalidPayload, internalError } = actionResults;

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

  const clearPaneTitle = async (paneId: string): Promise<ActionResult> => {
    const targetPaneId = resolvePaneId(paneId);
    if (!targetPaneId) {
      return invalidPayload("pane id is required");
    }

    const cleared = await adapter.run(["select-pane", "-t", targetPaneId, "-T", ""]);
    if (cleared.exitCode === 0 || isTmuxTargetMissing(cleared.stderr || "")) {
      return okResult();
    }
    return internalError(cleared.stderr || "select-pane -T failed");
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

  return { clearPaneTitle, killPane, killWindow, focusPane };
};
