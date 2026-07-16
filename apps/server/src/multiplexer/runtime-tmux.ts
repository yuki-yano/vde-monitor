import os from "node:os";
import path from "node:path";

import type { AgentMonitorConfig, MultiplexerRuntime } from "@vde-monitor/multiplexer";
import { resolveMonitorServerKey } from "@vde-monitor/shared/node";
import {
  createInspector,
  createPipeManager,
  createScreenCapture,
  createTmuxAdapter,
} from "@vde-monitor/tmux";

import { createTmuxActions } from "../tmux-actions";
import { createPaneLogDaemonClient } from "../monitor/pane-log-daemon-client";

export const buildPaneLogDaemonBaseCommand = ({
  execPath,
  execArgv,
  entrypoint,
}: {
  execPath: string;
  execArgv: readonly string[];
  entrypoint: string | undefined;
}): string[] => {
  if (entrypoint == null || entrypoint.length === 0) {
    throw new Error("cannot build pane log daemon command without process.argv[1]");
  }
  return [execPath, ...execArgv, path.resolve(entrypoint), "internal", "pane-log-daemon"];
};

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
  const paneLogDaemonCommand = buildPaneLogDaemonBaseCommand({
    execPath: process.execPath,
    execArgv: process.execArgv,
    entrypoint: process.argv[1],
  });
  const paneLogTransport = createPaneLogDaemonClient({
    baseDir: path.join(os.homedir(), ".vde-monitor"),
    serverKey,
    daemonBaseCommand: paneLogDaemonCommand,
    runtimeScope: process.argv[1]?.endsWith(".ts") ? `dev-${process.pid}` : undefined,
  });
  return {
    backend: "tmux",
    serverKey,
    inspector: createInspector(adapter),
    screenCapture: createScreenCapture(adapter),
    actions,
    capabilities: {
      pipe: createPipeManager(adapter, serverKey, paneLogTransport),
      launch: { launchAgentInSession },
    },
    dispose: paneLogTransport.dispose,
  };
};
