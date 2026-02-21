import type {
  AgentMonitorConfig,
  ApiError,
  LaunchAgent,
  LaunchAgentResult,
  LaunchCommandResponse,
  LaunchRollback,
} from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";

import { buildError } from "../errors";
import type { ActionResult, ActionResultHelpers } from "./action-results";
import {
  assertSessionExists,
  createDetachedWindow,
  interruptPaneForRelaunch,
  resolveExistingPaneLaunchTarget,
  resolveUniqueWindowName,
  rollbackCreatedWindow,
  sendLaunchCommand,
  verifyLaunch,
} from "./launch-tmux-ops";
import {
  containsNulOrLineBreak,
  normalizeLaunchOptions,
  normalizeOptionalText,
  resolveConfiguredLaunchOptions,
  validateCwd,
  validateLaunchInputCombination,
  validateLaunchOptions,
  validateWindowName,
} from "./launch-validation";
import { resolveSessionSnapshotCwd, resolveWorktreeCwd } from "./launch-worktree-resolver";

type CreateLaunchActionsParams = {
  adapter: TmuxAdapter;
  config: AgentMonitorConfig;
  actionResults: ActionResultHelpers;
  exitCopyModeIfNeeded: (paneId: string) => Promise<void>;
  sendEnterKey: (paneId: string) => Promise<ActionResult>;
};

type LaunchResult = LaunchCommandResponse;

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

export const createLaunchActions = ({
  adapter,
  config,
  actionResults,
  exitCopyModeIfNeeded,
  sendEnterKey,
}: CreateLaunchActionsParams) => {
  const { internalError } = actionResults;

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
    resumeFromPaneId,
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
    resumeSessionId?: string;
    resumeFromPaneId?: string;
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
    const normalizedResumeSessionId = normalizeOptionalText(resumeSessionId);
    const normalizedResumeFromPaneId = normalizeOptionalText(resumeFromPaneId);
    if (
      normalizedResumeSessionId &&
      (normalizedResumeSessionId.length > 256 || containsNulOrLineBreak(normalizedResumeSessionId))
    ) {
      return launchError(
        buildError("INVALID_PAYLOAD", "resumeSessionId contains an invalid value"),
        defaultLaunchRollback(),
      );
    }
    if (
      normalizedResumeFromPaneId &&
      (normalizedResumeFromPaneId.length > 64 || containsNulOrLineBreak(normalizedResumeFromPaneId))
    ) {
      return launchError(
        buildError("INVALID_PAYLOAD", "resumeFromPaneId contains an invalid value"),
        defaultLaunchRollback(),
      );
    }

    const launchInputError = validateLaunchInputCombination({
      cwd: normalizedCwd,
      worktreePath: normalizedWorktreePath,
      worktreeBranch: normalizedWorktreeBranch,
      worktreeCreateIfMissing: normalizedWorktreeCreateIfMissing,
    });
    if (launchInputError) {
      return launchError(launchInputError, defaultLaunchRollback());
    }

    const sessionError = await assertSessionExists(adapter, normalizedSessionName);
    if (sessionError) {
      return launchError(sessionError, defaultLaunchRollback());
    }

    const resolvedWorktreeCwd = await resolveWorktreeCwd({
      adapter,
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
    let resumeCommandCwd = finalCwd;
    if (normalizedResumeSessionId && !resumeCommandCwd) {
      const snapshotCwd = await resolveSessionSnapshotCwd({
        adapter,
        sessionName: normalizedSessionName,
      });
      if (snapshotCwd.ok) {
        resumeCommandCwd = snapshotCwd.cwd;
      } else {
        console.warn(
          `[vde-monitor] failed to resolve snapshot cwd for resume: session=${normalizedSessionName} agent=${agent} error=${snapshotCwd.error.message}`,
        );
      }
    }

    const resolvedOptions = resolveConfiguredLaunchOptions({
      config,
      agent,
      optionsOverride: normalizedAgentOptions,
    });
    const resolvedOptionsError = validateLaunchOptions(resolvedOptions);
    if (resolvedOptionsError) {
      return launchError(resolvedOptionsError, defaultLaunchRollback());
    }

    if (normalizedResumeFromPaneId) {
      const target = await resolveExistingPaneLaunchTarget({
        adapter,
        paneId: normalizedResumeFromPaneId,
      });
      if (!target.ok) {
        return launchError(target.error, defaultLaunchRollback());
      }

      const interruptError = await interruptPaneForRelaunch({
        adapter,
        paneId: target.paneId,
        agent,
        exitCopyModeIfNeeded,
      });
      if (interruptError) {
        return launchError(interruptError, defaultLaunchRollback());
      }

      const sendResult = await sendLaunchCommand({
        adapter,
        paneId: target.paneId,
        agent,
        options: resolvedOptions,
        resumeSessionId: normalizedResumeSessionId,
        finalCwd: resumeCommandCwd,
        exitCopyModeIfNeeded,
        sendEnterKey,
        internalError,
        skipExitCopyMode: true,
        forceShellCwdPrefix: true,
      });
      if (!sendResult.ok) {
        console.warn(
          `[vde-monitor] relaunch send failed after interrupt: session=${normalizedSessionName} pane=${target.paneId} window=${target.windowId}:${target.windowName} agent=${agent} error=${sendResult.error.message}`,
        );
        return launchError(sendResult.error, defaultLaunchRollback());
      }

      const verification = await verifyLaunch({
        adapter,
        paneId: target.paneId,
        agent,
      });

      return launchSuccess({
        sessionName: normalizedSessionName,
        agent,
        windowId: target.windowId,
        windowIndex: target.windowIndex,
        windowName: target.windowName,
        paneId: target.paneId,
        launchedCommand: agent,
        resolvedOptions,
        verification,
      });
    }

    const resolvedWindowName = await resolveUniqueWindowName({
      adapter,
      sessionName: normalizedSessionName,
      requestedName: normalizedWindowName,
      agent,
    });
    if (!resolvedWindowName.ok) {
      return launchError(resolvedWindowName.error, defaultLaunchRollback());
    }

    const detachedWindowCwd =
      finalCwd ?? (normalizedResumeSessionId && !normalizedCwd ? resumeCommandCwd : undefined);
    const created = await createDetachedWindow({
      adapter,
      sessionName: normalizedSessionName,
      windowName: resolvedWindowName.windowName,
      cwd: detachedWindowCwd,
    });
    if (!created.ok) {
      return launchError(created.error, defaultLaunchRollback());
    }

    const sendResult = await sendLaunchCommand({
      adapter,
      paneId: created.paneId,
      agent,
      options: resolvedOptions,
      resumeSessionId: normalizedResumeSessionId,
      finalCwd: resumeCommandCwd,
      exitCopyModeIfNeeded,
      sendEnterKey,
      internalError,
    });
    if (!sendResult.ok) {
      const rollback = await rollbackCreatedWindow(adapter, created.windowId);
      return launchError(sendResult.error, rollback);
    }

    const verification = await verifyLaunch({
      adapter,
      paneId: created.paneId,
      agent,
    });

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

  return {
    launchAgentInSession,
  };
};
