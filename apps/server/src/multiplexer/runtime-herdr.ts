import os from "node:os";

import type { AgentMonitorConfig, MultiplexerRuntime } from "@vde-monitor/multiplexer";
import {
  HerdrClient,
  createHerdrActions,
  createHerdrInspector,
  createHerdrScreenCapture,
  resolveSocketPath,
} from "@vde-monitor/herdr";
import { resolveMonitorServerKey } from "@vde-monitor/shared";

import { normalizeFingerprint } from "../monitor/monitor-utils";

export const createHerdrRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  const socketPath = resolveSocketPath(process.env, os.homedir());
  const client = new HerdrClient(socketPath);
  const inspector = createHerdrInspector(client);
  const screenCapture = createHerdrScreenCapture(client);
  const actions = createHerdrActions(client, config);
  const captureFingerprint = async (paneId: string, useAlt: boolean) => {
    try {
      const captured = await screenCapture.captureText({
        paneId,
        lines: 200,
        joinLines: false,
        includeAnsi: true,
        altScreen: "auto",
        alternateOn: useAlt,
      });
      return normalizeFingerprint(captured.screen);
    } catch {
      return null;
    }
  };

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
    capabilities: {},
    captureFingerprint,
  };
};
