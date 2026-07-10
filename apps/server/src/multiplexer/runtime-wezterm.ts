import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { resolveMonitorServerKey, resolveWeztermServerKey } from "@vde-monitor/shared";
import {
  createInspector,
  createScreenCapture,
  createWeztermActions,
  createWeztermAdapter,
} from "@vde-monitor/wezterm";

import { markPaneFocus } from "../activity-suppressor";
import { resolveBackendApp } from "../screen/macos-app";
import { focusTerminalApp, isAppRunning } from "../screen/macos-applescript";
import type { MultiplexerRuntime } from "@vde-monitor/multiplexer";

export const createWeztermServerKey = (target: string | null | undefined) => {
  return resolveWeztermServerKey(target);
};

export const createWeztermRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  const adapter = createWeztermAdapter({
    cliPath: config.multiplexer.wezterm.cliPath,
    target: config.multiplexer.wezterm.target,
  });
  const inspector = createInspector(adapter);
  const screenCapture = createScreenCapture(adapter);
  const baseActions = createWeztermActions(adapter, config);
  const actions: MultiplexerRuntime["actions"] = {
    ...baseActions,
    focusPane: async (paneId: string) => {
      const result = await baseActions.focusPane(paneId);
      if (!result.ok) {
        return result;
      }
      markPaneFocus(paneId);
      if (process.platform !== "darwin") {
        return result;
      }
      const app = resolveBackendApp("wezterm");
      if (!app) {
        return result;
      }
      try {
        const running = await isAppRunning(app.appName);
        if (running) {
          await focusTerminalApp(app.appName);
        }
      } catch {
        // ignore focus errors after pane activation succeeds
      }
      return result;
    },
  };
  return {
    backend: "wezterm",
    serverKey: resolveMonitorServerKey({
      multiplexerBackend: "wezterm",
      tmuxSocketName: config.tmux.socketName,
      tmuxSocketPath: config.tmux.socketPath,
      weztermTarget: config.multiplexer.wezterm.target,
    }),
    inspector,
    screenCapture,
    actions,
    capabilities: {},
  };
};
