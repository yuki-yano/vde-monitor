import fs from "node:fs";
import path from "node:path";

import type {
  AgentMonitorConfigFile,
  GeneratedConfigTemplate,
  UserConfigReadable,
} from "@vde-monitor/shared";
import {
  configDefaults,
  configOverrideSchema,
  configSchema,
  generatedConfigTemplateAllowlist,
  generatedConfigTemplateSchema,
  pickGeneratedConfigTemplateAllowlist,
  pickUserConfigAllowlist,
  resolveConfigDir,
} from "@vde-monitor/shared";
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

type AllowlistNode = true | { [key: string]: AllowlistNode };

const collectAllowlistLeafPaths = (allowlist: AllowlistNode, prefix: string[] = []): string[] => {
  if (allowlist === true) {
    return [prefix.join(".")];
  }
  return Object.entries(allowlist).flatMap(([key, nestedAllowlist]) =>
    collectAllowlistLeafPaths(nestedAllowlist, [...prefix, key]),
  );
};

const collectMissingAllowlistLeafPaths = (
  source: unknown,
  allowlist: AllowlistNode,
  prefix: string[] = [],
): string[] => {
  if (allowlist === true) {
    return [];
  }
  if (!isPlainObject(source)) {
    return collectAllowlistLeafPaths(allowlist, prefix);
  }
  const missingPaths: string[] = [];
  for (const [key, nestedAllowlist] of Object.entries(allowlist)) {
    const nextPrefix = [...prefix, key];
    if (!Object.hasOwn(source, key)) {
      missingPaths.push(...collectAllowlistLeafPaths(nestedAllowlist, nextPrefix));
      continue;
    }
    if (nestedAllowlist === true) {
      continue;
    }
    missingPaths.push(
      ...collectMissingAllowlistLeafPaths(source[key], nestedAllowlist, nextPrefix),
    );
  }
  return missingPaths;
};

const createMissingRequiredKeysError = ({
  configPath,
  missingKeys,
}: {
  configPath: string;
  missingKeys: string[];
}) => {
  const formattedKeys = missingKeys.map((key) => `- ${key}`).join("\n");
  return new Error(
    [
      `config is missing required generated keys: ${configPath}`,
      formattedKeys,
      "Run `vde-monitor config regenerate` to overwrite and regenerate the config file.",
    ].join("\n"),
  );
};

const validateRequiredGeneratedKeys = ({
  value,
  configPath,
}: {
  value: unknown;
  configPath: string;
}) => {
  const missingKeys = collectMissingAllowlistLeafPaths(value, generatedConfigTemplateAllowlist);
  if (missingKeys.length === 0) {
    return;
  }
  throw createMissingRequiredKeysError({ configPath, missingKeys });
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

export const loadProjectConfigOverride = (projectConfigPath: string): UserConfigReadable => {
  let raw: string;
  try {
    raw = fs.readFileSync(projectConfigPath, "utf8");
  } catch {
    throw new Error(`failed to read project config: ${projectConfigPath}`);
  }

  let json: unknown;
  const ext = path.extname(projectConfigPath).toLowerCase();
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

  const picked = pickUserConfigAllowlist(json);
  const parsed = configOverrideSchema.safeParse(picked);
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

const validateUserConfig = ({
  value,
  errorPrefix,
}: {
  value: unknown;
  errorPrefix: string;
}): UserConfigReadable => {
  const picked = pickUserConfigAllowlist(value);
  const parsed = configOverrideSchema.safeParse(picked);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathLabel = issue?.path?.join(".") ?? "unknown";
    const detail = issue?.message ?? "validation failed";
    throw new Error(`${errorPrefix}: ${pathLabel} ${detail}`);
  }
  return parsed.data;
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

const parseConfigFile = ({ raw, configPath }: { raw: string; configPath: string }) => {
  const ext = path.extname(configPath).toLowerCase();
  if (ext === ".json") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`invalid config JSON: ${configPath}`);
    }
  }
  try {
    return YAML.parse(raw);
  } catch {
    throw new Error(`invalid config: ${configPath} failed to parse YAML`);
  }
};

export const mergeConfigLayers = ({
  globalConfig,
  projectOverride,
  fileOverrides,
}: {
  globalConfig: UserConfigReadable | null;
  projectOverride: UserConfigReadable | null;
  fileOverrides: UserConfigReadable | undefined;
}) => {
  const withGlobal =
    globalConfig == null ? configDefaults : deepMerge(configDefaults, globalConfig);
  const withProject = projectOverride == null ? withGlobal : deepMerge(withGlobal, projectOverride);
  const withFileOverrides = deepMerge(withProject, fileOverrides);
  return validateMergedConfig(withFileOverrides);
};

export const resolveGlobalConfigPath = () =>
  resolveFirstExistingPath({
    candidatePaths: getConfigPaths(),
    readErrorPrefix: "failed to read config",
  });

export const loadConfig = ({
  enforceRequiredGeneratedKeys = true,
}: { enforceRequiredGeneratedKeys?: boolean } = {}): UserConfigReadable | null => {
  const configPath = resolveGlobalConfigPath();
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

  const json = parseConfigFile({ raw, configPath });
  if (enforceRequiredGeneratedKeys) {
    validateRequiredGeneratedKeys({ value: json, configPath });
  }
  return validateUserConfig({ value: json, errorPrefix: "invalid config" });
};

export const buildGeneratedConfigTemplate = (
  resolvedConfig: AgentMonitorConfigFile,
): GeneratedConfigTemplate => {
  const picked = pickGeneratedConfigTemplateAllowlist(resolvedConfig);
  const parsed = generatedConfigTemplateSchema.safeParse(picked);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathLabel = issue?.path?.join(".") ?? "unknown";
    const detail = issue?.message ?? "validation failed";
    throw new Error(`invalid generated config template: ${pathLabel} ${detail}`);
  }
  return parsed.data;
};

export const saveConfig = (config: GeneratedConfigTemplate) => {
  const parsed = generatedConfigTemplateSchema.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathLabel = issue?.path?.join(".") ?? "unknown";
    const detail = issue?.message ?? "validation failed";
    throw new Error(`invalid generated config template: ${pathLabel} ${detail}`);
  }
  const dir = getConfigDir();
  ensureDir(dir);
  const serialized = YAML.stringify(parsed.data);
  const normalized = serialized.endsWith("\n") ? serialized : `${serialized}\n`;
  const outputPath = getDefaultConfigPath();
  writeFileSafe(outputPath, normalized);
  return outputPath;
};
