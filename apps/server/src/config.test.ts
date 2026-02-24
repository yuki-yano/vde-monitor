import path from "node:path";

import { configDefaults } from "@vde-monitor/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn((size: number) => Buffer.alloc(size, 0xab)),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  statSync: vi.fn(),
  homedir: vi.fn(() => "/mock/home"),
}));

vi.mock("@vde-monitor/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vde-monitor/shared")>();
  return {
    ...actual,
    resolveConfigDir: () => "/mock/config",
  };
});

vi.mock("node:crypto", () => ({
  default: { randomBytes: mocks.randomBytes },
  randomBytes: mocks.randomBytes,
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
    chmodSync: mocks.chmodSync,
    statSync: mocks.statSync,
  },
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
  chmodSync: mocks.chmodSync,
  statSync: mocks.statSync,
}));

vi.mock("node:os", () => ({
  default: { homedir: mocks.homedir },
  homedir: mocks.homedir,
}));

import {
  ensureConfig,
  initConfig,
  mergeConfigLayers,
  regenerateConfig,
  resolveProjectConfigPath,
  resolveProjectConfigSearchBoundary,
  rotateToken,
} from "./config";

const configPath = path.resolve("/mock/config/config.yml");
const tokenPath = path.resolve("/mock/home/.vde-monitor/token.json");

const fileContents = new Map<string, string>();
const writtenContents = new Map<string, string>();
const directoryPaths = new Set<string>();
const statErrorCodes = new Map<string, string>();
let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

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

const setConfigFile = (config: unknown) => {
  const serialized = YAML.stringify(config);
  setFile(configPath, serialized.endsWith("\n") ? serialized : `${serialized}\n`);
};

const setTokenFile = (token: string) => {
  setFile(tokenPath, `${JSON.stringify({ token }, null, 2)}\n`);
};

const setProjectConfigFile = (targetPath: string, config: unknown) => {
  setFile(path.resolve(targetPath), `${JSON.stringify(config, null, 2)}\n`);
};

const setStatError = (targetPath: string, code: string) => {
  statErrorCodes.set(path.resolve(targetPath), code);
};

const expectedGeneratedTemplate = {
  multiplexer: {
    backend: "tmux",
  },
  screen: {
    image: {
      backend: "terminal",
    },
  },
  dangerKeys: ["C-c", "C-d", "C-z"],
  dangerCommandPatterns: configDefaults.dangerCommandPatterns,
  launch: configDefaults.launch,
  usagePricing: {
    providers: configDefaults.usagePricing.providers,
  },
  workspaceTabs: {
    displayMode: "all",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fileContents.clear();
  writtenContents.clear();
  directoryPaths.clear();
  statErrorCodes.clear();
  setDirectory("/");

  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(path.resolve("/mock/cwd"));

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

  mocks.writeFileSync.mockImplementation((targetPath: unknown, data: unknown) => {
    if (typeof targetPath !== "string" || typeof data !== "string") {
      throw new Error("unexpected write args");
    }
    const resolved = path.resolve(targetPath);
    writtenContents.set(resolved, data);
    setFile(resolved, data);
  });

  mocks.mkdirSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected mkdir args");
    }
    setDirectory(targetPath);
    return undefined;
  });

  mocks.statSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected stat args");
    }
    const resolved = path.resolve(targetPath);
    const forcedCode = statErrorCodes.get(resolved);
    if (forcedCode) {
      throw createFsError(forcedCode, resolved);
    }
    if (fileContents.has(resolved)) {
      return {
        isFile: () => true,
        isDirectory: () => false,
      };
    }
    if (directoryPaths.has(resolved)) {
      return {
        isFile: () => false,
        isDirectory: () => true,
      };
    }
    throw createFsError("ENOENT", resolved);
  });

  mocks.chmodSync.mockImplementation(() => undefined);
});

afterEach(() => {
  cwdSpy?.mockRestore();
  cwdSpy = null;
});

describe("resolveProjectConfigSearchBoundary", () => {
  it("detects repository root when .git is a directory", () => {
    setDirectory("/mock/repo/.git");
    const boundary = resolveProjectConfigSearchBoundary({
      cwd: "/mock/repo/apps/server/src",
    });
    expect(boundary).toBe(path.resolve("/mock/repo"));
  });

  it("detects repository root when .git is a file", () => {
    setFile("/mock/worktree/.git", "gitdir: /tmp/worktrees/a\n");
    const boundary = resolveProjectConfigSearchBoundary({
      cwd: "/mock/worktree/packages/app",
    });
    expect(boundary).toBe(path.resolve("/mock/worktree"));
  });

  it("uses cwd as boundary when not inside a repository", () => {
    const boundary = resolveProjectConfigSearchBoundary({
      cwd: "/mock/no-repo/project/subdir",
    });
    expect(boundary).toBe(path.resolve("/mock/no-repo/project/subdir"));
  });

  it("throws when git metadata cannot be inspected", () => {
    setStatError("/mock/repo/.git", "EACCES");
    expect(() =>
      resolveProjectConfigSearchBoundary({
        cwd: "/mock/repo/apps/server/src",
      }),
    ).toThrow(/failed to inspect git metadata/);
  });
});

describe("resolveProjectConfigPath", () => {
  it("stops searching at repository root boundary", () => {
    setProjectConfigFile("/mock/.vde/monitor/config.yml", { port: 19000 });
    const resolved = resolveProjectConfigPath({
      cwd: "/mock/repo/apps/server",
      boundaryDir: "/mock/repo",
    });
    expect(resolved).toBeNull();
  });

  it("prefers project config.yml over config.json in the same directory", () => {
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.json", { port: 19000 });
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.yml", { port: 12000 });
    const resolved = resolveProjectConfigPath({
      cwd: "/mock/repo/apps/server",
      boundaryDir: "/mock/repo",
    });
    expect(resolved).toBe(path.resolve("/mock/repo/apps/.vde/monitor/config.yml"));
  });

  it("falls back to project config.json when yaml files are missing", () => {
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.json", { port: 19000 });
    const resolved = resolveProjectConfigPath({
      cwd: "/mock/repo/apps/server",
      boundaryDir: "/mock/repo",
    });
    expect(resolved).toBe(path.resolve("/mock/repo/apps/.vde/monitor/config.json"));
  });
});

describe("mergeConfigLayers", () => {
  it("recursively merges objects and replaces arrays by higher-priority value", () => {
    const merged = mergeConfigLayers({
      globalConfig: {
        allowedOrigins: ["https://global.example"],
        screen: {
          maxLines: 1800,
        },
      },
      projectOverride: {
        allowedOrigins: ["https://project.example"],
        screen: {
          maxLines: 1900,
        },
      },
      fileOverrides: {
        screen: {
          maxLines: 1200,
        },
      },
    });

    expect(merged.allowedOrigins).toEqual(["https://project.example"]);
    expect(merged.screen.maxLines).toBe(1200);
  });
});

describe("ensureConfig", () => {
  it("creates config and token when no files exist", () => {
    const result = ensureConfig({ bind: "0.0.0.0" });

    expect(result.bind).toBe("0.0.0.0");
    expect(result.port).toBe(configDefaults.port);
    expect(result.notifications).toEqual(configDefaults.notifications);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    expect(YAML.parse(writtenContents.get(configPath) ?? "{}")).toEqual(expectedGeneratedTemplate);
    expect(JSON.parse(writtenContents.get(tokenPath) ?? "{}")).toEqual({ token: result.token });
  });

  it("does not rewrite existing config and only persists missing token", () => {
    setConfigFile({
      multiplexer: { backend: "wezterm" },
      screen: { image: { backend: "wezterm" } },
      dangerKeys: ["C-c", "C-d", "C-z"],
      dangerCommandPatterns: configDefaults.dangerCommandPatterns,
      launch: configDefaults.launch,
      usagePricing: { providers: configDefaults.usagePricing.providers },
      workspaceTabs: { displayMode: "all" },
    });

    const result = ensureConfig({ bind: "0.0.0.0" });

    expect(result.bind).toBe("0.0.0.0");
    expect(result.multiplexer.backend).toBe("wezterm");
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    const writtenPaths = mocks.writeFileSync.mock.calls.map((args) => path.resolve(args[0]));
    expect(writtenPaths).toEqual([tokenPath]);
  });

  it("applies CLI > project > global > default precedence", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      port: 10080,
      screen: {
        maxLines: 1500,
        image: { backend: "terminal" },
      },
      fileNavigator: { includeIgnoredPaths: ["global/**"] },
    });
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/web/src"));
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.yml", {
      port: 12000,
      screen: { maxLines: 1300 },
      fileNavigator: { includeIgnoredPaths: ["project/**"], autoExpandMatchLimit: 150 },
    });

    const result = ensureConfig({ port: 13000 });

    expect(result.port).toBe(13000);
    expect(result.screen.maxLines).toBe(1300);
    expect(result.fileNavigator.includeIgnoredPaths).toEqual(["project/**"]);
    expect(result.fileNavigator.autoExpandMatchLimit).toBe(150);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("ignores unknown keys in global/project config", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      port: 10080,
      logs: { retainRotations: 999 },
    });
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setProjectConfigFile("/mock/repo/.vde/monitor/config.yml", {
      input: { maxTextLength: 99999 },
      fileNavigator: { autoExpandMatchLimit: 120 },
    });

    const result = ensureConfig();

    expect(result.port).toBe(10080);
    expect(result.fileNavigator.autoExpandMatchLimit).toBe(120);
    expect(result.token).toBe("existing-token");
  });

  it("throws when project config contains invalid JSON", () => {
    setConfigFile(expectedGeneratedTemplate);
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setFile("/mock/repo/.vde/monitor/config.json", "{ invalid-json\n");

    expect(() => ensureConfig()).toThrow(
      `invalid project config JSON: ${path.resolve("/mock/repo/.vde/monitor/config.json")}`,
    );
  });

  it("throws when project config contains invalid includeIgnoredPaths pattern", () => {
    setConfigFile(expectedGeneratedTemplate);
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setProjectConfigFile("/mock/repo/.vde/monitor/config.yml", {
      fileNavigator: {
        includeIgnoredPaths: ["!dist/**"],
      },
    });

    expect(() => ensureConfig()).toThrow(/invalid project config: .*includeIgnoredPaths/);
  });

  it("throws when notifications.enabledEventTypes is empty", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      notifications: {
        enabledEventTypes: [],
      },
    });

    expect(() => ensureConfig()).toThrow(/invalid config/);
  });

  it("throws with missing key list and regenerate guidance when required generated keys are missing", () => {
    setConfigFile({
      multiplexer: { backend: "wezterm" },
      screen: { image: { backend: "wezterm" } },
      dangerKeys: ["C-c", "C-d", "C-z"],
      launch: configDefaults.launch,
      usagePricing: { providers: configDefaults.usagePricing.providers },
    });

    expect(() => ensureConfig()).toThrowError(
      /config is missing required generated keys: .*config\.yml/s,
    );
    expect(() => ensureConfig()).toThrow(/dangerCommandPatterns/);
    expect(() => ensureConfig()).toThrow(/workspaceTabs\.displayMode/);
    expect(() => ensureConfig()).toThrow(/vde-monitor config regenerate/);
  });
});

describe("regenerateConfig", () => {
  it("overwrites config and restores missing required generated keys", () => {
    setConfigFile({
      multiplexer: { backend: "wezterm" },
      dangerKeys: ["C-c", "C-d", "C-z"],
      launch: configDefaults.launch,
      usagePricing: { providers: configDefaults.usagePricing.providers },
      workspaceTabs: { displayMode: "all" },
    });

    const result = regenerateConfig();

    expect(result.configPath).toBe(configPath);
    expect(result.config).toEqual({
      ...expectedGeneratedTemplate,
      multiplexer: { backend: "wezterm" },
    });
    expect(YAML.parse(writtenContents.get(configPath) ?? "{}")).toEqual({
      ...expectedGeneratedTemplate,
      multiplexer: { backend: "wezterm" },
    });

    const writtenPaths = mocks.writeFileSync.mock.calls.map((args) => path.resolve(args[0]));
    expect(writtenPaths).toEqual([configPath]);
  });

  it("ignores project override while regenerating global config", () => {
    setConfigFile(expectedGeneratedTemplate);
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setFile("/mock/repo/.vde/monitor/config.yml", "{");

    const result = regenerateConfig();

    expect(result.config).toEqual(expectedGeneratedTemplate);
    expect(YAML.parse(writtenContents.get(configPath) ?? "{}")).toEqual(expectedGeneratedTemplate);
  });
});

describe("initConfig", () => {
  it("creates initial generated config only when no config exists", () => {
    const result = initConfig();

    expect(result).toEqual({ created: true, configPath });
    expect(YAML.parse(writtenContents.get(configPath) ?? "{}")).toEqual(expectedGeneratedTemplate);

    const writtenPaths = mocks.writeFileSync.mock.calls.map((args) => path.resolve(args[0]));
    expect(writtenPaths).toEqual([configPath]);
  });

  it("does not overwrite when config already exists", () => {
    setFile("/mock/config/config.json", `${JSON.stringify({ port: 18080 }, null, 2)}\n`);

    const result = initConfig();

    expect(result).toEqual({
      created: false,
      configPath: path.resolve("/mock/config/config.json"),
    });
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("ignores project override while creating initial global config", () => {
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setFile("/mock/repo/.vde/monitor/config.yml", "{");

    const result = initConfig();

    expect(result).toEqual({ created: true, configPath });
    expect(YAML.parse(writtenContents.get(configPath) ?? "{}")).toEqual(expectedGeneratedTemplate);
  });
});

describe("rotateToken", () => {
  it("rotates token and persists only the new token", () => {
    setConfigFile(expectedGeneratedTemplate);
    setTokenFile("old-token");

    const result = rotateToken();

    expect(result.token).not.toBe("old-token");
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(writtenContents.get(tokenPath) ?? "{}")).toEqual({ token: result.token });
    const writtenPaths = mocks.writeFileSync.mock.calls.map((args) => path.resolve(args[0]));
    expect(writtenPaths).toEqual([tokenPath]);
    expect(mocks.randomBytes).toHaveBeenCalled();
  });
});
