import {
  CmuxClient,
  createCmuxActions,
  createCmuxInspector,
  createCmuxScreenCapture,
  createCmuxSurfaceWorkspaceIndex,
} from "@vde-monitor/cmux";
import type { AgentMonitorConfig, MultiplexerRuntime } from "@vde-monitor/multiplexer";
import { resolveMonitorServerKey } from "@vde-monitor/shared/node";

import { markPaneFocus } from "../activity-suppressor";

const resolveCmuxSocketPath = (config: AgentMonitorConfig) => {
  const socketPath = config.multiplexer.cmux.socketPath?.trim();
  if (!socketPath) {
    throw new Error("cmux socket path is unavailable; run the cmux preflight first");
  }
  return socketPath;
};

export const createCmuxRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  const socketPath = resolveCmuxSocketPath(config);
  const client = new CmuxClient(socketPath, {
    password: config.multiplexer.cmux.password,
  });
  const surfaceWorkspaceIndex = createCmuxSurfaceWorkspaceIndex();
  const baseActions = createCmuxActions(client, config);
  const actions: MultiplexerRuntime["actions"] = {
    ...baseActions,
    focusPane: async (paneId) => {
      const result = await baseActions.focusPane(paneId);
      if (result.ok) {
        markPaneFocus(paneId);
      }
      return result;
    },
  };

  return {
    backend: "cmux",
    serverKey: resolveMonitorServerKey({
      multiplexerBackend: "cmux",
      tmuxSocketName: config.tmux.socketName,
      tmuxSocketPath: config.tmux.socketPath,
      weztermTarget: config.multiplexer.wezterm.target,
      cmuxSocketPath: socketPath,
    }),
    inspector: createCmuxInspector(client, { surfaceWorkspaceIndex }),
    screenCapture: createCmuxScreenCapture(client, { surfaceWorkspaceIndex }),
    actions,
    capabilities: {},
    dispose: () => client.close(),
  };
};
