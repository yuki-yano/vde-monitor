import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  AgentMonitorConfig,
  AgentMonitorConfigFile,
  AgentMonitorConfigOverride,
} from "@vde-monitor/shared";
import {
  configOverrideSchema,
  configSchema,
  defaultConfig,
  resolveConfigDir,
} from "@vde-monitor/shared";

export const getConfigDir = () => {
  return resolveConfigDir();
};

export const getConfigPath = () => {
  return path.join(getConfigDir(), "config.json");
};

const PROJECT_CONFIG_RELATIVE_PATH = path.join(".vde", "monitor", "config.json");

const getTokenDir = () => {
  return path.join(os.homedir(), ".vde-monitor");
};

const getTokenPath = () => {
  return path.join(getTokenDir(), "token.json");
};

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
};

const writeFileSafe = (filePath: string, data: string) => {
  fs.writeFileSync(filePath, data, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore
  }
};

const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const loadToken = (): string | null => {
  const tokenPath = getTokenPath();
  try {
    const raw = fs.readFileSync(tokenPath, "utf8");
    const parsed = JSON.parse(raw) as { token?: unknown };
    if (typeof parsed.token === "string" && parsed.token.trim().length > 0) {
      return parsed.token;
    }
    return null;
  } catch {
    return null;
  }
};

const isMissingFileError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "ENOENT" || error.message.includes("ENOENT");
};

const isPathUnderDirectory = (targetPath: string, directoryPath: string) => {
  const relativePath = path.relative(directoryPath, targetPath);
  if (relativePath.length === 0) {
    return true;
  }
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
};

const hasGitMetadataEntry = (dirPath: string) => {
  try {
    fs.statSync(path.join(dirPath, ".git"));
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    return false;
  }
};

export const resolveProjectConfigSearchBoundary = ({ cwd }: { cwd: string }) => {
  const startPath = path.resolve(cwd);
  let currentPath = startPath;

  while (true) {
    if (hasGitMetadataEntry(currentPath)) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  return startPath;
};

const resolveFileIfExists = (targetPath: string) => {
  try {
    const stats = fs.statSync(targetPath);
    return stats.isFile() ? targetPath : null;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw new Error(`failed to read project config: ${targetPath}`);
  }
};

export const resolveProjectConfigPath = ({
  cwd,
  boundaryDir,
}: {
  cwd: string;
  boundaryDir: string;
}) => {
  const startPath = path.resolve(cwd);
  const resolvedBoundary = path.resolve(boundaryDir);
  const effectiveBoundary = isPathUnderDirectory(startPath, resolvedBoundary)
    ? resolvedBoundary
    : startPath;

  let currentPath = startPath;
  while (true) {
    const candidatePath = path.join(currentPath, PROJECT_CONFIG_RELATIVE_PATH);
    const resolvedPath = resolveFileIfExists(candidatePath);
    if (resolvedPath) {
      return resolvedPath;
    }
    if (currentPath === effectiveBoundary) {
      break;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
  return null;
};

export const loadProjectConfigOverride = (
  projectConfigPath: string,
): AgentMonitorConfigOverride => {
  let raw: string;
  try {
    raw = fs.readFileSync(projectConfigPath, "utf8");
  } catch {
    throw new Error(`failed to read project config: ${projectConfigPath}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`invalid project config JSON: ${projectConfigPath}`);
  }

  const parsed = configOverrideSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathLabel = issue?.path?.join(".") ?? "unknown";
    const detail = issue?.message ?? "validation failed";
    throw new Error(`invalid project config: ${projectConfigPath} ${pathLabel} ${detail}`);
  }
  return parsed.data;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== "object") {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
};

const deepMerge = (baseValue: unknown, overrideValue: unknown): unknown => {
  if (typeof overrideValue === "undefined") {
    return baseValue;
  }
  if (Array.isArray(overrideValue)) {
    return [...overrideValue];
  }
  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const merged: Record<string, unknown> = { ...baseValue };
    Object.keys(overrideValue).forEach((key) => {
      merged[key] = deepMerge(baseValue[key], overrideValue[key]);
    });
    return merged;
  }
  if (isPlainObject(overrideValue)) {
    const merged: Record<string, unknown> = {};
    Object.keys(overrideValue).forEach((key) => {
      merged[key] = deepMerge(undefined, overrideValue[key]);
    });
    return merged;
  }
  return overrideValue;
};

const validateMergedConfig = (value: unknown): AgentMonitorConfigFile => {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathLabel = issue?.path?.join(".") ?? "unknown";
    const detail = issue?.message ?? "validation failed";
    throw new Error(`invalid config: ${pathLabel} ${detail}`);
  }
  return parsed.data;
};

export const mergeConfigLayers = ({
  base,
  globalConfig,
  projectOverride,
  fileOverrides,
}: {
  base: AgentMonitorConfigFile;
  globalConfig: AgentMonitorConfigFile | null;
  projectOverride: AgentMonitorConfigOverride | null;
  fileOverrides: Partial<AgentMonitorConfigFile> | undefined;
}) => {
  const withGlobal = globalConfig == null ? base : deepMerge(base, globalConfig);
  const withProject = projectOverride == null ? withGlobal : deepMerge(withGlobal, projectOverride);
  const withFileOverrides = deepMerge(withProject, fileOverrides);
  return validateMergedConfig(withFileOverrides);
};

const saveToken = (token: string) => {
  const dir = getTokenDir();
  ensureDir(dir);
  writeFileSafe(getTokenPath(), `${JSON.stringify({ token }, null, 2)}\n`);
};

const ensureToken = () => {
  const existing = loadToken();
  if (existing) {
    return existing;
  }
  const token = generateToken();
  saveToken(token);
  return token;
};

export const loadConfig = (): AgentMonitorConfigFile | null => {
  const configPath = getConfigPath();
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw new Error(`failed to read config: ${configPath}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`invalid config JSON: ${configPath}`);
  }

  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathLabel = issue?.path?.join(".") ?? "unknown";
    const detail = issue?.message ?? "validation failed";
    throw new Error(`invalid config: ${pathLabel} ${detail}`);
  }
  return parsed.data;
};

export const saveConfig = (config: AgentMonitorConfigFile) => {
  const dir = getConfigDir();
  ensureDir(dir);
  writeFileSafe(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`);
};

export const ensureConfig = (overrides?: Partial<AgentMonitorConfigFile>) => {
  const globalConfig = loadConfig();
  const cwd = process.cwd();
  const boundaryDir = resolveProjectConfigSearchBoundary({ cwd });
  const projectConfigPath = resolveProjectConfigPath({ cwd, boundaryDir });
  const projectOverride = projectConfigPath ? loadProjectConfigOverride(projectConfigPath) : null;

  if (!globalConfig) {
    const persistedConfig = mergeConfigLayers({
      base: defaultConfig,
      globalConfig: null,
      projectOverride: null,
      fileOverrides: overrides,
    });
    saveConfig(persistedConfig);
  }

  const config = mergeConfigLayers({
    base: defaultConfig,
    globalConfig,
    projectOverride,
    fileOverrides: overrides,
  });

  const token = ensureToken();
  return { ...config, token };
};

export const rotateToken = () => {
  const config = ensureConfig();
  const token = generateToken();
  saveToken(token);
  return { ...config, token };
};

export const applyRuntimeOverrides = (
  config: AgentMonitorConfig,
  overrides: Partial<AgentMonitorConfig>,
) => {
  return { ...config, ...overrides };
};
