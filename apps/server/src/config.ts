import {
  buildGeneratedConfigTemplate,
  checkGlobalConfig,
  loadConfig,
  mergeConfigLayers,
  pruneGlobalConfig,
  resolveGlobalConfigPath,
  saveConfig,
} from "./infra/config/config-loader";
import { ensureToken, generateToken, saveToken } from "./token-store";

export { resolveGlobalConfigPath } from "./infra/config/config-loader";

type ConfigInitResult =
  | {
      created: true;
      configPath: string;
    }
  | {
      created: false;
      configPath: string;
    };

export const ensureConfig = () => {
  const globalConfig = loadConfig();

  if (!globalConfig) {
    const persistedConfig = mergeConfigLayers({
      globalConfig: null,
    });
    saveConfig(buildGeneratedConfigTemplate(persistedConfig));
  }

  const config = mergeConfigLayers({
    globalConfig,
  });

  const token = ensureToken();
  return { ...config, token };
};

export const regenerateConfig = () => {
  const globalConfig = loadConfig({ enforceRequiredGeneratedKeys: false });
  const resolvedConfig = mergeConfigLayers({
    globalConfig,
  });
  const template = buildGeneratedConfigTemplate(resolvedConfig);
  const configPath = saveConfig(template);
  return { configPath, config: template };
};

export const initConfig = (): ConfigInitResult => {
  const existingConfigPath = resolveGlobalConfigPath();
  if (existingConfigPath) {
    return {
      created: false,
      configPath: existingConfigPath,
    };
  }

  const resolvedConfig = mergeConfigLayers({
    globalConfig: null,
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
