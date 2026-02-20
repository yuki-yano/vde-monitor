import path from "node:path";

import { defaultConfig } from "@vde-monitor/shared";
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
        ...defaultConfig,
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
          ...defaultConfig,
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
      tmuxSocketName: defaultConfig.tmux.socketName,
      tmuxSocketPath: defaultConfig.tmux.socketPath,
      weztermTarget: "yml-target",
    });
  });

  it("prefers config.yaml over config.json when config.yml is missing", () => {
    setFile(
      "/mock/config/config.yaml",
      YAML.stringify({
        ...defaultConfig,
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
          ...defaultConfig,
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
      tmuxSocketName: defaultConfig.tmux.socketName,
      tmuxSocketPath: defaultConfig.tmux.socketPath,
      weztermTarget: "yaml-target",
    });
  });

  it("falls back to config.json when config.yml is not a regular file", () => {
    setDirectory("/mock/config/config.yml");
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...defaultConfig,
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
      tmuxSocketName: defaultConfig.tmux.socketName,
      tmuxSocketPath: defaultConfig.tmux.socketPath,
      weztermTarget: "json-target",
    });
  });
});
