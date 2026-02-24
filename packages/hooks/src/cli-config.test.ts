import path from "node:path";

import { configDefaults } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("@vde-monitor/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vde-monitor/shared")>();
  return {
    ...actual,
    resolveConfigDir: () => "/mock/config",
  };
});

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
    statSync: mocks.statSync,
  },
  readFileSync: mocks.readFileSync,
  statSync: mocks.statSync,
}));

import { loadConfig } from "./cli";

const fileContents = new Map<string, string>();
const directoryPaths = new Set<string>();

const createFsError = (code: string, targetPath: string) => {
  const error = new Error(`${code}: ${targetPath}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
};

const setDirectory = (targetPath: string) => {
  const resolved = path.resolve(targetPath);
  let current = resolved;
  while (true) {
    directoryPaths.add(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
};

const setFile = (targetPath: string, content: string) => {
  const resolved = path.resolve(targetPath);
  fileContents.set(resolved, content);
  setDirectory(path.dirname(resolved));
};

beforeEach(() => {
  vi.clearAllMocks();
  fileContents.clear();
  directoryPaths.clear();
  setDirectory("/");

  mocks.readFileSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected path type");
    }
    const resolved = path.resolve(targetPath);
    const raw = fileContents.get(resolved);
    if (raw != null) {
      return raw;
    }
    if (directoryPaths.has(resolved)) {
      throw createFsError("EISDIR", resolved);
    }
    throw createFsError("ENOENT", resolved);
  });

  mocks.statSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected stat args");
    }
    const resolved = path.resolve(targetPath);
    if (fileContents.has(resolved)) {
      return {
        isFile: () => true,
      };
    }
    if (directoryPaths.has(resolved)) {
      return {
        isFile: () => false,
      };
    }
    throw createFsError("ENOENT", resolved);
  });
});

describe("hooks config loading", () => {
  it("prefers config.yml over config.json", () => {
    setFile(
      "/mock/config/config.yml",
      YAML.stringify({
        ...configDefaults,
        multiplexer: {
          backend: "wezterm",
          wezterm: {
            cliPath: "wezterm",
            target: "yml-target",
          },
        },
      }),
    );
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...configDefaults,
          multiplexer: {
            backend: "tmux",
            wezterm: {
              cliPath: "wezterm",
              target: "json-target",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    expect(loadConfig()).toEqual({
      multiplexerBackend: "wezterm",
      tmuxSocketName: configDefaults.tmux.socketName,
      tmuxSocketPath: configDefaults.tmux.socketPath,
      weztermTarget: "yml-target",
    });
  });

  it("prefers config.yaml over config.json when config.yml is missing", () => {
    setFile(
      "/mock/config/config.yaml",
      YAML.stringify({
        ...configDefaults,
        multiplexer: {
          backend: "wezterm",
          wezterm: {
            cliPath: "wezterm",
            target: "yaml-target",
          },
        },
      }),
    );
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...configDefaults,
          multiplexer: {
            backend: "tmux",
            wezterm: {
              cliPath: "wezterm",
              target: "json-target",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    expect(loadConfig()).toEqual({
      multiplexerBackend: "wezterm",
      tmuxSocketName: configDefaults.tmux.socketName,
      tmuxSocketPath: configDefaults.tmux.socketPath,
      weztermTarget: "yaml-target",
    });
  });

  it("falls back to config.json when config.yml is not a regular file", () => {
    setDirectory("/mock/config/config.yml");
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...configDefaults,
          multiplexer: {
            backend: "tmux",
            wezterm: {
              cliPath: "wezterm",
              target: "json-target",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    expect(loadConfig()).toEqual({
      multiplexerBackend: "tmux",
      tmuxSocketName: configDefaults.tmux.socketName,
      tmuxSocketPath: configDefaults.tmux.socketPath,
      weztermTarget: "json-target",
    });
  });

  it("loads minimal generated config and falls back optional values to defaults", () => {
    setFile(
      "/mock/config/config.yml",
      YAML.stringify({
        multiplexer: { backend: "wezterm" },
        screen: { image: { backend: "terminal" } },
        dangerKeys: ["C-c", "C-d", "C-z"],
        dangerCommandPatterns: configDefaults.dangerCommandPatterns,
        launch: {
          agents: {
            codex: { options: [] },
            claude: { options: [] },
          },
        },
        usagePricing: {
          providers: {
            codex: { enabled: true },
            claude: { enabled: true },
          },
        },
        workspaceTabs: { displayMode: "all" },
      }),
    );

    expect(loadConfig()).toEqual({
      multiplexerBackend: "wezterm",
      tmuxSocketName: configDefaults.tmux.socketName,
      tmuxSocketPath: configDefaults.tmux.socketPath,
      weztermTarget: configDefaults.multiplexer.wezterm.target,
    });
  });

  it("ignores unknown keys and still resolves hook server config", () => {
    setFile(
      "/mock/config/config.yml",
      YAML.stringify({
        multiplexer: {
          backend: "tmux",
          wezterm: {
            target: "custom-target",
          },
        },
        screen: {
          image: {
            backend: "terminal",
            enabled: false,
          },
          defaultLines: 999,
        },
        dangerKeys: ["C-c", "C-d", "C-z"],
        dangerCommandPatterns: configDefaults.dangerCommandPatterns,
        launch: {
          agents: {
            codex: { options: [] },
            claude: { options: [] },
          },
        },
        usagePricing: {
          providers: {
            codex: { enabled: true },
            claude: { enabled: true },
          },
        },
        workspaceTabs: { displayMode: "all" },
        tmux: {
          socketName: "sock",
          socketPath: "/tmp/tmux.sock",
        },
        logs: {
          retainRotations: 999,
        },
        input: {
          maxTextLength: 99999,
        },
      }),
    );

    expect(loadConfig()).toEqual({
      multiplexerBackend: "tmux",
      tmuxSocketName: "sock",
      tmuxSocketPath: "/tmp/tmux.sock",
      weztermTarget: "custom-target",
    });
  });
});
