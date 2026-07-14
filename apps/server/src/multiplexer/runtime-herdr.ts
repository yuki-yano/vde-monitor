import os from "node:os";

import type { AgentMonitorConfig, MultiplexerRuntime } from "@vde-monitor/multiplexer";
import {
  HerdrClient,
  createHerdrActions,
  createHerdrInspector,
  createHerdrLaunchCapability,
  createHerdrScreenCapture,
  resolveSocketPath,
} from "@vde-monitor/herdr";
import { resolveMonitorServerKey } from "@vde-monitor/shared/node";

export const createHerdrRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  const socketPath = resolveSocketPath(process.env, os.homedir());
  const client = new HerdrClient(socketPath);
  const inspector = createHerdrInspector(client);
  const screenCapture = createHerdrScreenCapture(client);
  const actions = createHerdrActions(client, config);
  const launch = createHerdrLaunchCapability({ client, config });
  return {
    backend: "herdr",
    serverKey: resolveMonitorServerKey({
      multiplexerBackend: "herdr",
      tmuxSocketName: config.tmux.socketName,
      tmuxSocketPath: config.tmux.socketPath,
      weztermTarget: config.multiplexer.wezterm.target,
      herdrSocketPath: socketPath,
    }),
    inspector,
    screenCapture,
    actions,
    capabilities: { launch },
    dispose: () => client.close(),
  };
};
