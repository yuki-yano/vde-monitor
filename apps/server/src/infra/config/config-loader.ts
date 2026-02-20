import fs from "node:fs";
import path from "node:path";

import type { AgentMonitorConfigFile, AgentMonitorConfigOverride } from "@vde-monitor/shared";
import { configOverrideSchema, configSchema, resolveConfigDir } from "@vde-monitor/shared";
import YAML from "yaml";

const CONFIG_FILE_BASENAMES = ["config.yml", "config.yaml", "config.json"] as const;
const DEFAULT_CONFIG_FILE_BASENAME = "config.yml";
const PROJECT_CONFIG_RELATIVE_DIR = path.join(".vde", "monitor");

const getConfigDir = () => {
  return resolveConfigDir();
};

const getConfigPaths = () => {
  return CONFIG_FILE_BASENAMES.map((basename) => path.join(getConfigDir(), basename));
};

const getDefaultConfigPath = () => {
  return path.join(getConfigDir(), DEFAULT_CONFIG_FILE_BASENAME);
};

const getProjectConfigCandidatePaths = (basePath: string) => {
  return CONFIG_FILE_BASENAMES.map((basename) =>
    path.join(basePath, PROJECT_CONFIG_RELATIVE_DIR, basename),
  );
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
  const gitMetadataPath = path.join(dirPath, ".git");
  try {
    fs.statSync(gitMetadataPath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw new Error(`failed to inspect git metadata: ${gitMetadataPath}`);
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

const buildReadError = ({
  targetPath,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
}: {
  targetPath: string;
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
}) => {
  if (nonRegularFileErrorPrefix) {
    return new Error(`${nonRegularFileErrorPrefix}: ${targetPath}`);
  }
  return new Error(`${readErrorPrefix}: ${targetPath}`);
};

const resolveFileIfExists = ({
  targetPath,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
}: {
  targetPath: string;
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
}) => {
  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isFile()) {
      return {
        path: null,
        nonRegularError: buildReadError({ targetPath, readErrorPrefix, nonRegularFileErrorPrefix }),
      };
    }
    return { path: targetPath, nonRegularError: null };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { path: null, nonRegularError: null };
    }
    if (
      error instanceof Error &&
      (error.message.startsWith(`${readErrorPrefix}:`) ||
        (nonRegularFileErrorPrefix != null &&
          error.message.startsWith(`${nonRegularFileErrorPrefix}:`)))
    ) {
      throw error;
    }
    throw new Error(`${readErrorPrefix}: ${targetPath}`);
  }
};

const resolveFirstExistingPath = ({
  candidatePaths,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
}: {
  candidatePaths: string[];
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
}) => {
  let firstNonRegularError: Error | null = null;
  for (const candidatePath of candidatePaths) {
    const { path: resolvedPath, nonRegularError } = resolveFileIfExists({
      targetPath: candidatePath,
      readErrorPrefix,
      nonRegularFileErrorPrefix,
    });
    if (resolvedPath) {
      return resolvedPath;
    }
    if (!firstNonRegularError && nonRegularError) {
      firstNonRegularError = nonRegularError;
    }
  }
  if (firstNonRegularError) {
    throw firstNonRegularError;
  }
  return null;
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
    const resolvedPath = resolveFirstExistingPath({
      candidatePaths: getProjectConfigCandidatePaths(currentPath),
      readErrorPrefix: "failed to read project config",
      nonRegularFileErrorPrefix: "project config path exists but is not a regular file",
    });
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

  const ext = path.extname(projectConfigPath).toLowerCase();
  let json: unknown;
  if (ext === ".json") {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`invalid project config JSON: ${projectConfigPath}`);
    }
  } else {
    try {
      json = YAML.parse(raw);
    } catch {
      throw new Error(`invalid project config: ${projectConfigPath} failed to parse YAML`);
    }
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

export const loadConfig = (): AgentMonitorConfigFile | null => {
  const configPath = resolveFirstExistingPath({
    candidatePaths: getConfigPaths(),
    readErrorPrefix: "failed to read config",
  });
  if (configPath == null) {
    return null;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw new Error(`failed to read config: ${configPath}`);
  }

  const ext = path.extname(configPath).toLowerCase();
  let json: unknown;
  if (ext === ".json") {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`invalid config JSON: ${configPath}`);
    }
  } else {
    try {
      json = YAML.parse(raw);
    } catch {
      throw new Error(`invalid config: ${configPath} failed to parse YAML`);
    }
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
  const serialized = YAML.stringify(config);
  const normalized = serialized.endsWith("\n") ? serialized : `${serialized}\n`;
  writeFileSafe(getDefaultConfigPath(), normalized);
};
