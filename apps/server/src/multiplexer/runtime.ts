import type { AgentMonitorConfig } from "@vde-monitor/shared";

import { createTmuxRuntime } from "./runtime-tmux";
import { createWeztermRuntime } from "./runtime-wezterm";
import type { MultiplexerRuntime } from "./types";

export const createMultiplexerRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  if (config.multiplexer.backend === "wezterm") {
    return createWeztermRuntime(config);
  }
  return createTmuxRuntime(config);
};
