import type { GeneratedConfigTemplate, UserConfigReadable } from "./types";

type AllowlistNode = true | { [key: string]: AllowlistNode };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
};

const cloneConfigValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneConfigValue(item));
  }
  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      next[key] = cloneConfigValue(nestedValue);
    }
    return next;
  }
  return value;
};

const deepPick = (source: unknown, allowlist: AllowlistNode): unknown => {
  if (allowlist === true) {
    return cloneConfigValue(source);
  }
  if (!isPlainObject(source)) {
    return {};
  }

  const picked: Record<string, unknown> = {};
  for (const [key, nestedAllowlist] of Object.entries(allowlist)) {
    if (!(key in source)) {
      continue;
    }
    if (nestedAllowlist === true) {
      picked[key] = cloneConfigValue(source[key]);
      continue;
    }
    const nestedPicked = deepPick(source[key], nestedAllowlist);
    if (isPlainObject(nestedPicked) && Object.keys(nestedPicked).length === 0) {
      continue;
    }
    picked[key] = nestedPicked;
  }
  return picked;
};

const deepPickObject = <T>(source: unknown, allowlist: AllowlistNode): T => {
  const picked = deepPick(source, allowlist);
  if (!isPlainObject(picked)) {
    return {} as T;
  }
  return picked as T;
};

export const userConfigAllowlist = {
  bind: true,
  port: true,
  allowedOrigins: true,
  dangerKeys: true,
  dangerCommandPatterns: true,
  activity: {
    pollIntervalMs: true,
    runningThresholdMs: true,
  },
  screen: {
    maxLines: true,
    highlightCorrection: {
      codex: true,
      claude: true,
    },
    image: {
      backend: true,
    },
  },
  multiplexer: {
    backend: true,
    wezterm: {
      cliPath: true,
      target: true,
    },
  },
  launch: {
    agents: {
      codex: {
        options: true,
      },
      claude: {
        options: true,
      },
    },
  },
  notifications: {
    pushEnabled: true,
    enabledEventTypes: true,
  },
  usagePricing: {
    providers: {
      codex: {
        enabled: true,
      },
      claude: {
        enabled: true,
      },
    },
  },
  workspaceTabs: {
    displayMode: true,
  },
  fileNavigator: {
    includeIgnoredPaths: true,
    autoExpandMatchLimit: true,
  },
  tmux: {
    socketName: true,
    socketPath: true,
    primaryClient: true,
  },
} as const satisfies AllowlistNode;

export const generatedConfigTemplateAllowlist = {
  multiplexer: {
    backend: true,
  },
  screen: {
    image: {
      backend: true,
    },
  },
  dangerKeys: true,
  dangerCommandPatterns: true,
  launch: {
    agents: {
      codex: {
        options: true,
      },
      claude: {
        options: true,
      },
    },
  },
  usagePricing: {
    providers: {
      codex: {
        enabled: true,
      },
      claude: {
        enabled: true,
      },
    },
  },
  workspaceTabs: {
    displayMode: true,
  },
} as const satisfies AllowlistNode;

export const pickUserConfigAllowlist = (source: unknown): UserConfigReadable =>
  deepPickObject<UserConfigReadable>(source, userConfigAllowlist);

export const pickGeneratedConfigTemplateAllowlist = (source: unknown): GeneratedConfigTemplate =>
  deepPickObject<GeneratedConfigTemplate>(source, generatedConfigTemplateAllowlist);
