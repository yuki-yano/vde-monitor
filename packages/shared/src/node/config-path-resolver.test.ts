import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveConfigFilePath } from "./config-path-resolver";

const mocks = vi.hoisted(() => ({
  statSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    statSync: mocks.statSync,
  },
  statSync: mocks.statSync,
}));

const filePaths = new Set<string>();
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

const setFile = (targetPath: string) => {
  const resolved = path.resolve(targetPath);
  filePaths.add(resolved);
  setDirectory(path.dirname(resolved));
};

beforeEach(() => {
  vi.clearAllMocks();
  filePaths.clear();
  directoryPaths.clear();
  setDirectory("/");

  mocks.statSync.mockImplementation((targetPath: unknown) => {
    if (typeof targetPath !== "string") {
      throw new Error("unexpected path type");
    }
    const resolved = path.resolve(targetPath);
    if (filePaths.has(resolved)) {
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

describe("resolveConfigFilePath", () => {
  it("prefers config.yml over config.json", () => {
    setFile("/mock/config/config.yml");
    setFile("/mock/config/config.json");

    const resolved = resolveConfigFilePath({
      configDir: "/mock/config",
      readErrorPrefix: "failed to read config",
      nonRegularFileErrorPrefix: "config path exists but is not a regular file",
    });

    expect(resolved).toBe(path.resolve("/mock/config/config.yml"));
  });

  it("falls back to config.json when config.yml exists as directory", () => {
    setDirectory("/mock/config/config.yml");
    setFile("/mock/config/config.json");

    const resolved = resolveConfigFilePath({
      configDir: "/mock/config",
      readErrorPrefix: "failed to read config",
      nonRegularFileErrorPrefix: "config path exists but is not a regular file",
    });

    expect(resolved).toBe(path.resolve("/mock/config/config.json"));
  });

  it("returns null when no config file exists", () => {
    const resolved = resolveConfigFilePath({
      configDir: "/mock/config",
      readErrorPrefix: "failed to read config",
      nonRegularFileErrorPrefix: "config path exists but is not a regular file",
    });

    expect(resolved).toBeNull();
  });

  it("throws non-regular file error when only non-regular path exists", () => {
    setDirectory("/mock/config/config.yml");

    expect(() =>
      resolveConfigFilePath({
        configDir: "/mock/config",
        readErrorPrefix: "failed to read config",
        nonRegularFileErrorPrefix: "config path exists but is not a regular file",
      }),
    ).toThrow("config path exists but is not a regular file: /mock/config/config.yml");
  });

  it("throws read error when stat fails unexpectedly", () => {
    mocks.statSync.mockImplementationOnce(() => {
      throw createFsError("EACCES", "/mock/config/config.yml");
    });

    expect(() =>
      resolveConfigFilePath({
        configDir: "/mock/config",
        readErrorPrefix: "failed to read config",
        nonRegularFileErrorPrefix: "config path exists but is not a regular file",
      }),
    ).toThrow("failed to read config: /mock/config/config.yml");
  });
});
