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
  userConfigAllowlist,
} from "@vde-monitor/shared";
import YAML from "yaml";

const CONFIG_FILE_BASENAMES = ["config.yml", "config.yaml", "config.json"] as const;
const DEFAULT_CONFIG_FILE_BASENAME = "config.yml";

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

const collectExtraAllowlistLeafPaths = (
  source: unknown,
  allowlist: AllowlistNode,
  prefix: string[] = [],
): string[] => {
  if (!isPlainObject(source) || allowlist === true) {
    return [];
  }
  const extras: string[] = [];
  for (const [key, nestedValue] of Object.entries(source)) {
    const nextAllowlist = allowlist[key];
    const nextPrefix = [...prefix, key];
    if (nextAllowlist == null) {
      extras.push(nextPrefix.join("."));
      continue;
    }
    if (nextAllowlist === true) {
      continue;
    }
    extras.push(...collectExtraAllowlistLeafPaths(nestedValue, nextAllowlist, nextPrefix));
  }
  return extras;
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

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
};

const resolveAtomicTempPath = (filePath: string) => {
  const randomToken = Math.random().toString(36).slice(2, 10);
  return `${filePath}.tmp-${process.pid}-${Date.now()}-${randomToken}`;
};

const writeFileAtomic = (filePath: string, data: string) => {
  const tempPath = resolveAtomicTempPath(filePath);
  fs.writeFileSync(tempPath, data, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tempPath, 0o600);
  } catch {
    // ignore
  }
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
};

const isMissingFileError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "ENOENT" || error.message.includes("ENOENT");
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

type ValidatedUserConfig =
  | {
      success: true;
      value: UserConfigReadable;
    }
  | {
      success: false;
      pathLabel: string;
      detail: string;
    };

const validateUserConfigSafe = (value: unknown): ValidatedUserConfig => {
  const picked = pickUserConfigAllowlist(value);
  const parsed = configOverrideSchema.safeParse(picked);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      pathLabel: issue?.path?.join(".") ?? "unknown",
      detail: issue?.message ?? "validation failed",
    };
  }
  return {
    success: true,
    value: parsed.data,
  };
};

const loadGlobalConfigDocument = (configPath: string) => {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    throw new Error(`failed to read config: ${configPath}`);
  }
  return parseConfigFile({ raw, configPath });
};

export type ConfigCheckIssue = {
  type: "parse" | "schema" | "missing-required-generated-key" | "extra-key";
  message: string;
  path?: string;
};

export type GlobalConfigCheckResult =
  | {
      ok: false;
      configPath: null;
      issues: [];
    }
  | {
      ok: boolean;
      configPath: string;
      issues: ConfigCheckIssue[];
    };

export const checkGlobalConfig = (): GlobalConfigCheckResult => {
  const configPath = resolveGlobalConfigPath();
  if (configPath == null) {
    return {
      ok: false,
      configPath: null,
      issues: [],
    };
  }

  let json: unknown;
  try {
    json = loadGlobalConfigDocument(configPath);
  } catch (error) {
    return {
      ok: false,
      configPath,
      issues: [
        {
          type: "parse",
          message: error instanceof Error ? error.message : "failed to parse config",
        },
      ],
    };
  }

  const issues: ConfigCheckIssue[] = [];
  const validatedUserConfig = validateUserConfigSafe(json);
  if (!validatedUserConfig.success) {
    issues.push({
      type: "schema",
      path: validatedUserConfig.pathLabel,
      message: `invalid config: ${validatedUserConfig.pathLabel} ${validatedUserConfig.detail}`,
    });
  }

  const missingGeneratedKeys = collectMissingAllowlistLeafPaths(
    json,
    generatedConfigTemplateAllowlist,
  );
  for (const missingKey of missingGeneratedKeys) {
    issues.push({
      type: "missing-required-generated-key",
      path: missingKey,
      message: `missing required generated key: ${missingKey}`,
    });
  }

  const extraKeys = collectExtraAllowlistLeafPaths(json, userConfigAllowlist);
  for (const extraKey of extraKeys) {
    issues.push({
      type: "extra-key",
      path: extraKey,
      message: `unused key: ${extraKey}`,
    });
  }

  return {
    ok: issues.length === 0,
    configPath,
    issues,
  };
};

export type GlobalConfigPruneResult = {
  inputPath: string;
  outputPath: string;
  dryRun: boolean;
  removedKeys: string[];
  removedLegacyJson: boolean;
};

export const pruneGlobalConfig = ({
  dryRun = false,
}: {
  dryRun?: boolean;
} = {}): GlobalConfigPruneResult => {
  const inputPath = resolveGlobalConfigPath();
  if (inputPath == null) {
    throw new Error("global config is missing. Run `vde-monitor config init` first.");
  }

  let json: unknown;
  try {
    json = loadGlobalConfigDocument(inputPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "failed to parse config";
    throw new Error(`${reason}\nRun \`vde-monitor config regenerate\` to overwrite the config.`);
  }

  const validatedUserConfig = validateUserConfigSafe(json);
  if (!validatedUserConfig.success) {
    throw new Error(
      [
        `invalid config: ${validatedUserConfig.pathLabel} ${validatedUserConfig.detail}`,
        "Run `vde-monitor config regenerate` to overwrite the config.",
      ].join("\n"),
    );
  }

  try {
    validateRequiredGeneratedKeys({ value: json, configPath: inputPath });
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("config is missing required generated keys");
  }

  const removedKeys = collectExtraAllowlistLeafPaths(json, userConfigAllowlist);
  const outputPath = getDefaultConfigPath();
  const serialized = YAML.stringify(validatedUserConfig.value);
  const normalized = serialized.endsWith("\n") ? serialized : `${serialized}\n`;

  let removedLegacyJson = false;
  if (!dryRun) {
    ensureDir(getConfigDir());
    writeFileAtomic(outputPath, normalized);
    if (
      path.extname(inputPath).toLowerCase() === ".json" &&
      path.resolve(inputPath) !== path.resolve(outputPath)
    ) {
      try {
        fs.unlinkSync(inputPath);
      } catch {
        throw new Error(`failed to remove legacy config JSON: ${inputPath}`);
      }
      removedLegacyJson = true;
    }
  }

  return {
    inputPath,
    outputPath,
    dryRun,
    removedKeys,
    removedLegacyJson,
  };
};

export const mergeConfigLayers = ({
  globalConfig,
  cliArgsOverride,
}: {
  globalConfig: UserConfigReadable | null;
  cliArgsOverride?: UserConfigReadable;
}) => {
  const withGlobal =
    globalConfig == null ? configDefaults : deepMerge(configDefaults, globalConfig);
  const withCliArgs = deepMerge(withGlobal, cliArgsOverride);
  return validateMergedConfig(withCliArgs);
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
  writeFileAtomic(outputPath, normalized);
  return outputPath;
};
