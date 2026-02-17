import type { AgentMonitorConfigFile } from "@vde-monitor/shared";
import { defaultConfig } from "@vde-monitor/shared";

import {
  loadConfig,
  loadProjectConfigOverride,
  mergeConfigLayers,
  resolveProjectConfigPath,
  resolveProjectConfigSearchBoundary,
  saveConfig,
} from "./infra/config/config-loader";
import { ensureToken, generateToken, saveToken } from "./token-store";

export {
  mergeConfigLayers,
  resolveProjectConfigPath,
  resolveProjectConfigSearchBoundary,
} from "./infra/config/config-loader";

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
