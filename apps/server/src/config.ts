import type { UserConfigReadable } from "@vde-monitor/shared";

import {
  buildGeneratedConfigTemplate,
  checkGlobalConfig,
  loadConfig,
  loadProjectConfigOverride,
  mergeConfigLayers,
  pruneGlobalConfig,
  resolveGlobalConfigPath,
  resolveProjectConfigPath,
  resolveProjectConfigSearchBoundary,
  saveConfig,
} from "./infra/config/config-loader";
import { ensureToken, generateToken, saveToken } from "./token-store";

export {
  mergeConfigLayers,
  resolveGlobalConfigPath,
  resolveProjectConfigPath,
  resolveProjectConfigSearchBoundary,
} from "./infra/config/config-loader";

type ConfigInitResult =
  | {
      created: true;
      configPath: string;
    }
  | {
      created: false;
      configPath: string;
    };

export const ensureConfig = (overrides?: UserConfigReadable) => {
  const globalConfig = loadConfig();
  const cwd = process.cwd();
  const boundaryDir = resolveProjectConfigSearchBoundary({ cwd });
  const projectConfigPath = resolveProjectConfigPath({ cwd, boundaryDir });
  const projectOverride = projectConfigPath ? loadProjectConfigOverride(projectConfigPath) : null;

  if (!globalConfig) {
    const persistedConfig = mergeConfigLayers({
      globalConfig: null,
      projectOverride: null,
      fileOverrides: overrides,
    });
    saveConfig(buildGeneratedConfigTemplate(persistedConfig));
  }

  const config = mergeConfigLayers({
    globalConfig,
    projectOverride,
    fileOverrides: overrides,
  });

  const token = ensureToken();
  return { ...config, token };
};

export const regenerateConfig = (overrides?: UserConfigReadable) => {
  const globalConfig = loadConfig({ enforceRequiredGeneratedKeys: false });
  const resolvedConfig = mergeConfigLayers({
    globalConfig,
    projectOverride: null,
    fileOverrides: overrides,
  });
  const template = buildGeneratedConfigTemplate(resolvedConfig);
  const configPath = saveConfig(template);
  return { configPath, config: template };
};

export const initConfig = (overrides?: UserConfigReadable): ConfigInitResult => {
  const existingConfigPath = resolveGlobalConfigPath();
  if (existingConfigPath) {
    return {
      created: false,
      configPath: existingConfigPath,
    };
  }

  const resolvedConfig = mergeConfigLayers({
    globalConfig: null,
    projectOverride: null,
    fileOverrides: overrides,
  });
  const template = buildGeneratedConfigTemplate(resolvedConfig);
  const configPath = saveConfig(template);
  return {
    created: true,
    configPath,
  };
};

export const rotateToken = () => {
  const config = ensureConfig();
  const token = generateToken();
  saveToken(token);
  return { ...config, token };
};

export const runConfigCheck = () => checkGlobalConfig();

export const runConfigPrune = ({ dryRun = false }: { dryRun?: boolean } = {}) =>
  pruneGlobalConfig({ dryRun });
