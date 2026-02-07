import type { AgentMonitorConfig } from "@vde-monitor/shared";
import { resolveServerKey } from "@vde-monitor/shared";
import {
  createInspector,
  createPipeManager,
  createScreenCapture,
  createTmuxAdapter,
} from "@vde-monitor/tmux";

import { createFingerprintCapture } from "../monitor/fingerprint";
import { createTmuxActions } from "../tmux-actions";
import type { MultiplexerRuntime } from "./types";

export const createTmuxRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  const adapter = createTmuxAdapter({
    socketName: config.tmux.socketName,
    socketPath: config.tmux.socketPath,
  });
  return {
    backend: "tmux",
    serverKey: resolveServerKey(config.tmux.socketName, config.tmux.socketPath),
    inspector: createInspector(adapter),
    screenCapture: createScreenCapture(adapter),
    actions: createTmuxActions(adapter, config),
    pipeManager: createPipeManager(adapter),
    captureFingerprint: createFingerprintCapture(adapter),
    pipeSupport: "tmux-pipe",
  };
};
