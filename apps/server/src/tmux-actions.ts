import type { AgentMonitorConfig } from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";

import { createActionResultHelpers } from "./tmux-actions/action-results";
import { createLaunchActions } from "./tmux-actions/launch-actions";
import { createPaneActions } from "./tmux-actions/pane-actions";
import { createSendActions } from "./tmux-actions/send-actions";

export const createTmuxActions = (adapter: TmuxAdapter, config: AgentMonitorConfig) => {
  const pendingCommands = new Map<string, string>();
  const dangerKeys = new Set(config.dangerKeys);
  const actionResults = createActionResultHelpers();

  const sendActions = createSendActions({
    adapter,
    config,
    pendingCommands,
    dangerKeys,
    actionResults,
  });

  const paneActions = createPaneActions({
    adapter,
    config,
    pendingCommands,
    actionResults,
    exitCopyModeIfNeeded: sendActions.exitCopyModeIfNeeded,
    sendEnterKey: sendActions.sendEnterKey,
  });

  const launchActions = createLaunchActions({
    adapter,
    config,
    actionResults,
    exitCopyModeIfNeeded: sendActions.exitCopyModeIfNeeded,
    sendEnterKey: sendActions.sendEnterKey,
  });

  return {
    sendText: sendActions.sendText,
    sendKeys: sendActions.sendKeys,
    sendRaw: sendActions.sendRaw,
    clearPaneTitle: paneActions.clearPaneTitle,
    focusPane: paneActions.focusPane,
    killPane: paneActions.killPane,
    killWindow: paneActions.killWindow,
    launchAgentInSession: launchActions.launchAgentInSession,
  };
};
