import type { AgentMonitorConfig, MultiplexerRuntime } from "@vde-monitor/multiplexer";

import { createCmuxRuntime } from "./runtime-cmux";
import { createHerdrRuntime } from "./runtime-herdr";
import { createTmuxRuntime } from "./runtime-tmux";
import { createWeztermRuntime } from "./runtime-wezterm";

export const createMultiplexerRuntime = (config: AgentMonitorConfig): MultiplexerRuntime => {
  if (config.multiplexer.backend === "herdr") {
    return createHerdrRuntime(config);
  }
  if (config.multiplexer.backend === "wezterm") {
    return createWeztermRuntime(config);
  }
  if (config.multiplexer.backend === "cmux") {
    return createCmuxRuntime(config);
  }
  return createTmuxRuntime(config);
};
