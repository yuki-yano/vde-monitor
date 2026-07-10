import type { AgentMonitorConfig, MultiplexerRuntime } from "@vde-monitor/multiplexer";
import { resolveMonitorServerKey } from "@vde-monitor/shared";
import {
  createInspector,
  createPipeManager,
  createScreenCapture,
  createTmuxAdapter,
} from "@vde-monitor/tmux";

import { createTmuxActions } from "../tmux-actions";

export const createTmuxRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  const adapter = createTmuxAdapter({
    socketName: config.tmux.socketName,
    socketPath: config.tmux.socketPath,
  });
  const { launchAgentInSession, ...actions } = createTmuxActions(adapter, config);
  const serverKey = resolveMonitorServerKey({
    multiplexerBackend: "tmux",
    tmuxSocketName: config.tmux.socketName,
    tmuxSocketPath: config.tmux.socketPath,
    weztermTarget: config.multiplexer.wezterm.target,
  });
  return {
    backend: "tmux",
    serverKey,
    inspector: createInspector(adapter),
    screenCapture: createScreenCapture(adapter),
    actions,
    capabilities: {
      pipe: createPipeManager(adapter, serverKey),
      launch: { launchAgentInSession },
    },
  };
};
