import path from "node:path";

import { defaultConfig } from "@vde-monitor/shared";
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
  mergeConfigLayers,
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

  it("prefers project config.yaml over config.json when config.yml is missing", () => {
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.yaml", { port: 18000 });
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.json", { port: 19000 });
    const resolved = resolveProjectConfigPath({
      cwd: "/mock/repo/apps/server",
      boundaryDir: "/mock/repo",
    });
    expect(resolved).toBe(path.resolve("/mock/repo/apps/.vde/monitor/config.yaml"));
  });

  it("falls back to project config.json when config.yml is not a regular file", () => {
    setDirectory("/mock/repo/apps/.vde/monitor/config.yml");
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
      base: defaultConfig,
      globalConfig: {
        ...defaultConfig,
        allowedOrigins: ["https://global.example"],
        rateLimit: {
          ...defaultConfig.rateLimit,
          send: {
            ...defaultConfig.rateLimit.send,
            windowMs: 2000,
          },
        },
      },
      projectOverride: {
        allowedOrigins: ["https://project.example"],
        rateLimit: {
          send: {
            max: 99,
          },
        },
      },
      fileOverrides: undefined,
    });

    expect(merged.allowedOrigins).toEqual(["https://project.example"]);
    expect(merged.rateLimit.send.windowMs).toBe(2000);
    expect(merged.rateLimit.send.max).toBe(99);
  });
});

describe("ensureConfig", () => {
  it("creates config and token when no files exist", () => {
    const result = ensureConfig({ bind: "0.0.0.0" });

    expect(result.bind).toBe("0.0.0.0");
    expect(result.port).toBe(defaultConfig.port);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    expect(YAML.parse(writtenContents.get(configPath) ?? "{}")).toEqual({
      ...defaultConfig,
      bind: "0.0.0.0",
    });
    expect(JSON.parse(writtenContents.get(tokenPath) ?? "{}")).toEqual({ token: result.token });
  });

  it("keeps existing legacy-looking values without auto migration", () => {
    setConfigFile({
      ...defaultConfig,
      port: 10080,
      screen: {
        ...defaultConfig.screen,
        image: {
          ...defaultConfig.screen.image,
          enabled: false,
        },
      },
    });
    setTokenFile("existing-token");

    const result = ensureConfig();

    expect(result.port).toBe(10080);
    expect(result.screen.image.enabled).toBe(false);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("does not rewrite existing config and only persists missing token", () => {
    setConfigFile(defaultConfig);

    const result = ensureConfig({ bind: "0.0.0.0" });

    expect(result.bind).toBe("0.0.0.0");
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    const writtenPaths = mocks.writeFileSync.mock.calls.map((args) => path.resolve(args[0]));
    expect(writtenPaths).toEqual([tokenPath]);
  });

  it("loads legacy global config.json when yaml files are missing", () => {
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...defaultConfig,
          port: 10081,
        },
        null,
        2,
      )}\n`,
    );
    setTokenFile("existing-token");

    const result = ensureConfig();

    expect(result.port).toBe(10081);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("prefers global config.yml over config.json when both files exist", () => {
    setConfigFile({
      ...defaultConfig,
      port: 10082,
    });
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...defaultConfig,
          port: 10083,
        },
        null,
        2,
      )}\n`,
    );
    setTokenFile("existing-token");

    const result = ensureConfig();

    expect(result.port).toBe(10082);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("prefers global config.yaml over config.json when config.yml is missing", () => {
    setFile(
      "/mock/config/config.yaml",
      `${YAML.stringify({
        ...defaultConfig,
        port: 10085,
      })}`,
    );
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...defaultConfig,
          port: 10086,
        },
        null,
        2,
      )}\n`,
    );
    setTokenFile("existing-token");

    const result = ensureConfig();

    expect(result.port).toBe(10085);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("falls back to global config.json when config.yml is not a regular file", () => {
    setDirectory("/mock/config/config.yml");
    setFile(
      "/mock/config/config.json",
      `${JSON.stringify(
        {
          ...defaultConfig,
          port: 10084,
        },
        null,
        2,
      )}\n`,
    );
    setTokenFile("existing-token");

    const result = ensureConfig();

    expect(result.port).toBe(10084);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("applies CLI > project > global > default precedence", () => {
    setConfigFile({
      ...defaultConfig,
      port: 10080,
      rateLimit: {
        ...defaultConfig.rateLimit,
        send: {
          ...defaultConfig.rateLimit.send,
          windowMs: 2500,
          max: 15,
        },
      },
      fileNavigator: {
        ...defaultConfig.fileNavigator,
        autoExpandMatchLimit: 60,
      },
    });
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/web/src"));
    setProjectConfigFile("/mock/repo/apps/.vde/monitor/config.yml", {
      port: 12000,
      rateLimit: {
        send: {
          max: 99,
        },
      },
      fileNavigator: {
        includeIgnoredPaths: ["tmp/ai/**"],
        autoExpandMatchLimit: 150,
      },
    });

    const result = ensureConfig({ port: 13000 });

    expect(result.port).toBe(13000);
    expect(result.rateLimit.send.windowMs).toBe(2500);
    expect(result.rateLimit.send.max).toBe(99);
    expect(result.fileNavigator.includeIgnoredPaths).toEqual(["tmp/ai/**"]);
    expect(result.fileNavigator.autoExpandMatchLimit).toBe(150);
    expect(result.token).toBe("existing-token");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("does not load project config above repository root boundary", () => {
    setConfigFile({
      ...defaultConfig,
      port: 10080,
    });
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/web"));
    setProjectConfigFile("/mock/.vde/monitor/config.yml", {
      port: 19000,
    });

    const result = ensureConfig();
    expect(result.port).toBe(10080);
  });

  it("does not search parent directories when cwd is outside repository", () => {
    setConfigFile({
      ...defaultConfig,
      port: 10080,
    });
    setTokenFile("existing-token");
    cwdSpy?.mockReturnValue(path.resolve("/mock/no-repo/work/subdir"));
    setProjectConfigFile("/mock/no-repo/work/.vde/monitor/config.yml", {
      port: 19000,
    });

    const result = ensureConfig();
    expect(result.port).toBe(10080);
  });

  it("throws when project config contains invalid JSON", () => {
    setConfigFile(defaultConfig);
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setFile("/mock/repo/.vde/monitor/config.json", "{ invalid-json\n");

    expect(() => ensureConfig()).toThrow(
      `invalid project config JSON: ${path.resolve("/mock/repo/.vde/monitor/config.json")}`,
    );
  });

  it("throws when project config contains invalid includeIgnoredPaths pattern", () => {
    setConfigFile(defaultConfig);
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

  it("throws when project config path exists as non-regular file", () => {
    setConfigFile(defaultConfig);
    setTokenFile("existing-token");
    setDirectory("/mock/repo/.git");
    cwdSpy?.mockReturnValue(path.resolve("/mock/repo/apps/server"));
    setDirectory("/mock/repo/.vde/monitor/config.yml");

    expect(() => ensureConfig()).toThrow(/project config path exists but is not a regular file/);
  });

  it("throws when config contains invalid includeIgnoredPaths pattern", () => {
    setConfigFile({
      ...defaultConfig,
      fileNavigator: {
        ...defaultConfig.fileNavigator,
        includeIgnoredPaths: ["!dist/**"],
      },
    });

    expect(() => ensureConfig()).toThrow(/invalid config/);
  });
});

describe("rotateToken", () => {
  it("rotates token and persists only the new token", () => {
    setConfigFile(defaultConfig);
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
