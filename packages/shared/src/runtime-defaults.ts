import { defaultDangerCommandPatterns } from "./constants";
import type { ResolvedConfig } from "./types";

export const configDefaults: ResolvedConfig = {
  bind: "127.0.0.1",
  port: 11080,
  allowedOrigins: [],
  dangerKeys: ["C-c", "C-d", "C-z"],
  dangerCommandPatterns: [...defaultDangerCommandPatterns],
  activity: {
    pollIntervalMs: 1000,
    runningThresholdMs: 5000,
  },
  screen: {
    maxLines: 2000,
    highlightCorrection: {
      codex: true,
      claude: true,
    },
    image: {
      backend: "terminal",
    },
  },
  multiplexer: {
    backend: "tmux",
    wezterm: {
      cliPath: "wezterm",
      target: "auto",
    },
  },
  launch: {
    agents: {
      codex: { options: [] },
      claude: { options: [] },
    },
  },
  notifications: {
    pushEnabled: true,
    enabledEventTypes: ["pane.waiting_permission", "pane.task_completed"],
  },
  usage: {
    session: {
      providers: {
        codex: {
          enabled: true,
        },
        claude: {
          enabled: true,
        },
      },
    },
    pricing: {
      providers: {
        codex: {
          enabled: true,
        },
        claude: {
          enabled: true,
        },
      },
    },
  },
  workspaceTabs: {
    displayMode: "all",
  },
  fileNavigator: {
    includeIgnoredPaths: [],
    autoExpandMatchLimit: 100,
  },
  tmux: {
    socketName: null,
    socketPath: null,
    primaryClient: null,
  },
};
