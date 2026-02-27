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
    summary: {
      enabled: false,
      rename: {
        pane: true,
        push: true,
      },
      sources: {
        codex: {
          enabled: true,
          waitMs: 7000,
          engine: {
            agent: "codex",
            model: "gpt-5.3-codex-spark",
            effort: "low",
          },
        },
        claude: {
          enabled: true,
          waitMs: 20000,
          engine: {
            agent: "claude",
            model: "claude-haiku-4-5",
            effort: "low",
          },
        },
      },
    },
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
