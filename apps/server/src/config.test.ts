import path from "node:path";

import { configDefaults } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn((size: number) => Buffer.alloc(size, 0xab)),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
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
    renameSync: mocks.renameSync,
    unlinkSync: mocks.unlinkSync,
    mkdirSync: mocks.mkdirSync,
    chmodSync: mocks.chmodSync,
    statSync: mocks.statSync,
  },
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  renameSync: mocks.renameSync,
  unlinkSync: mocks.unlinkSync,
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
  regenerateConfig,
  rotateToken,
  runConfigCheck,
  runConfigPrune,
} from "./config";
import { mergeConfigLayers } from "./infra/config/config-loader";

const configPath = path.resolve("/mock/config/config.yml");
const legacyJsonConfigPath = path.resolve("/mock/config/config.json");
const tokenPath = path.resolve("/mock/home/.vde-monitor/token.json");

const fileContents = new Map<string, string>();
const writtenContents = new Map<string, string>();
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

const setConfigFile = (config: unknown) => {
  const serialized = YAML.stringify(config);
  setFile(configPath, serialized.endsWith("\n") ? serialized : `${serialized}\n`);
};

const setLegacyJsonConfigFile = (config: unknown) => {
  setFile(legacyJsonConfigPath, `${JSON.stringify(config, null, 2)}\n`);
};

const setTokenFile = (token: string) => {
  setFile(tokenPath, `${JSON.stringify({ token }, null, 2)}\n`);
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
  workspaceTabs: {
    displayMode: "all",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fileContents.clear();
  writtenContents.clear();
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

  mocks.writeFileSync.mockImplementation((targetPath: unknown, data: unknown) => {
    if (typeof targetPath !== "string" || typeof data !== "string") {
      throw new Error("unexpected write args");
    }
    const resolved = path.resolve(targetPath);
    writtenContents.set(resolved, data);
    setFile(resolved, data);
  });

  mocks.renameSync.mockImplementation((fromPath: unknown, toPath: unknown) => {
    if (typeof fromPath !== "string" || typeof toPath !== "string") {
      throw new Error("unexpected rename args");
    }
    const resolvedFrom = path.resolve(fromPath);
    const resolvedTo = path.resolve(toPath);
    const raw = fileContents.get(resolvedFrom);
    if (raw == null) {
      throw createFsError("ENOENT", resolvedFrom);
    }
    fileContents.delete(resolvedFrom);
    setFile(resolvedTo, raw);
    writtenContents.set(resolvedTo, raw);
  });

  mocks.unlinkSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected unlink args");
    }
    const resolved = path.resolve(targetPath);
    if (!fileContents.has(resolved)) {
      throw createFsError("ENOENT", resolved);
    }
    fileContents.delete(resolved);
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

describe("mergeConfigLayers", () => {
  it("recursively merges objects and replaces arrays by higher-priority value", () => {
    const merged = mergeConfigLayers({
      globalConfig: {
        allowedOrigins: ["https://global.example"],
        screen: {
          maxLines: 1800,
        },
      },
      cliArgsOverride: {
        allowedOrigins: ["https://cli.example"],
        screen: {
          maxLines: 1200,
        },
      },
    });

    expect(merged.allowedOrigins).toEqual(["https://cli.example"]);
    expect(merged.screen.maxLines).toBe(1200);
  });
});

describe("ensureConfig", () => {
  it("creates config and token when no files exist", () => {
    const result = ensureConfig();

    expect(result.bind).toBe(configDefaults.bind);
    expect(result.port).toBe(configDefaults.port);
    expect(result.notifications).toEqual(configDefaults.notifications);
    expect(result.usage).toEqual(configDefaults.usage);
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
      workspaceTabs: { displayMode: "all" },
    });

    const result = ensureConfig();

    expect(result.bind).toBe(configDefaults.bind);
    expect(result.multiplexer.backend).toBe("wezterm");
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    const writtenPaths = mocks.writeFileSync.mock.calls.map((args) => path.resolve(args[0]));
    expect(writtenPaths).toEqual([tokenPath]);
  });

  it("applies global > default precedence", () => {
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

    const result = ensureConfig();

    expect(result.port).toBe(10080);
    expect(result.screen.maxLines).toBe(1500);
    expect(result.fileNavigator.includeIgnoredPaths).toEqual(["global/**"]);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("ignores unknown keys in global config", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      port: 10080,
      logs: { retainRotations: 999 },
      input: { maxTextLength: 99999 },
      fileNavigator: { autoExpandMatchLimit: 120 },
    });
    setTokenFile("existing-token");

    const result = ensureConfig();

    expect(result.port).toBe(10080);
    expect(result.fileNavigator.autoExpandMatchLimit).toBe(120);
    expect(result.token).toBe("existing-token");
  });

  it("throws when global config contains invalid includeIgnoredPaths pattern", () => {
    setTokenFile("existing-token");
    setConfigFile({
      ...expectedGeneratedTemplate,
      fileNavigator: {
        includeIgnoredPaths: ["!dist/**"],
      },
    });

    expect(() => ensureConfig()).toThrow(/invalid config: .*includeIgnoredPaths/);
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

    expect(mocks.renameSync).toHaveBeenCalledTimes(1);
    expect(path.resolve(mocks.renameSync.mock.calls[0]?.[1] ?? "")).toBe(configPath);
  });

  it("keeps global config precedence while regenerating", () => {
    setConfigFile(expectedGeneratedTemplate);

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

    expect(mocks.renameSync).toHaveBeenCalledTimes(1);
    expect(path.resolve(mocks.renameSync.mock.calls[0]?.[1] ?? "")).toBe(configPath);
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

describe("runConfigCheck", () => {
  it("returns missing status when global config does not exist", () => {
    const result = runConfigCheck();

    expect(result.ok).toBe(false);
    expect(result.configPath).toBeNull();
    expect(result.issues).toEqual([]);
  });

  it("detects extra keys", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      logs: {
        retainRotations: 99,
      },
    });

    const result = runConfigCheck();

    expect(result.ok).toBe(false);
    expect(result.configPath).toBe(configPath);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "extra-key",
          path: "logs",
        }),
      ]),
    );
  });

  it("passes when config has no issues", () => {
    setConfigFile(expectedGeneratedTemplate);

    const result = runConfigCheck();

    expect(result.ok).toBe(true);
    expect(result.configPath).toBe(configPath);
    expect(result.issues).toEqual([]);
  });
});

describe("runConfigPrune", () => {
  it("throws guidance when global config is missing", () => {
    expect(() => runConfigPrune()).toThrow(/vde-monitor config init/);
  });

  it("removes extra keys and writes YAML to config.yml", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      logs: {
        retainRotations: 99,
      },
    });

    const result = runConfigPrune();

    expect(result.outputPath).toBe(configPath);
    expect(result.removedKeys).toEqual(["logs"]);
    const parsedSaved = YAML.parse(fileContents.get(configPath) ?? "{}");
    expect(parsedSaved.logs).toBeUndefined();
    expect(parsedSaved.workspaceTabs.displayMode).toBe("all");
  });

  it("supports dry-run without file update", () => {
    setConfigFile({
      ...expectedGeneratedTemplate,
      logs: {
        retainRotations: 99,
      },
    });
    const before = fileContents.get(configPath);

    const result = runConfigPrune({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.removedKeys).toEqual(["logs"]);
    expect(fileContents.get(configPath)).toBe(before);
    expect(mocks.renameSync).not.toHaveBeenCalled();
  });

  it("rewrites legacy config.json as config.yml and deletes config.json", () => {
    setLegacyJsonConfigFile({
      ...expectedGeneratedTemplate,
      logs: {
        retainRotations: 99,
      },
    });

    const result = runConfigPrune();

    expect(result.inputPath).toBe(legacyJsonConfigPath);
    expect(result.outputPath).toBe(configPath);
    expect(result.removedLegacyJson).toBe(true);
    expect(fileContents.has(legacyJsonConfigPath)).toBe(false);
    expect(fileContents.has(configPath)).toBe(true);
    expect(mocks.unlinkSync).toHaveBeenCalledWith(legacyJsonConfigPath);
  });

  it("fails and suggests regenerate when config parse fails", () => {
    setFile(configPath, "{");

    expect(() => runConfigPrune()).toThrow(/vde-monitor config regenerate/);
    expect(mocks.renameSync).not.toHaveBeenCalled();
  });
});
