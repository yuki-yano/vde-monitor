import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentMonitorConfig, AgentMonitorConfigFile } from "@vde-monitor/shared";
import { configSchema, defaultConfig, resolveConfigDir } from "@vde-monitor/shared";

export const getConfigDir = () => {
  return resolveConfigDir();
};

export const getConfigPath = () => {
  return path.join(getConfigDir(), "config.json");
};

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
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = configSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

export const saveConfig = (config: AgentMonitorConfigFile) => {
  const dir = getConfigDir();
  ensureDir(dir);
  writeFileSafe(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`);
};

const migrateLegacyPort = (config: AgentMonitorConfigFile) => {
  if (config.port !== 10080 || defaultConfig.port !== 11080) {
    return { config, migrated: false };
  }
  return {
    config: { ...config, port: defaultConfig.port },
    migrated: true,
  };
};

const migrateImageCaptureDefault = (config: AgentMonitorConfigFile) => {
  if (config.screen?.image?.enabled !== false || defaultConfig.screen.image.enabled !== true) {
    return { config, migrated: false };
  }
  return {
    config: {
      ...config,
      screen: {
        ...config.screen,
        image: {
          ...config.screen.image,
          enabled: true,
        },
      },
    },
    migrated: true,
  };
};

const applyConfigMigrations = (config: AgentMonitorConfigFile) => {
  const portMigration = migrateLegacyPort(config);
  const imageMigration = migrateImageCaptureDefault(portMigration.config);
  return {
    config: imageMigration.config,
    migrated: portMigration.migrated || imageMigration.migrated,
  };
};

export const ensureConfig = (overrides?: Partial<AgentMonitorConfigFile>) => {
  const existing = loadConfig();
  if (existing) {
    const migration = applyConfigMigrations(existing);
    const next = migration.config;
    const migrated = migration.migrated;
    if (migrated) {
      saveConfig(next);
    }
    const token = ensureToken();
    return { ...next, ...overrides, token };
  }
  const config = { ...defaultConfig, ...overrides };
  saveConfig(config);
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
