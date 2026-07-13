import os from "node:os";
import path from "node:path";

const resolveHome = () => os.homedir();

const resolveXdgBase = (envKey: string, fallback: string) => {
  const value = process.env[envKey];
  if (value && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const resolveConfigHome = () =>
  resolveXdgBase("XDG_CONFIG_HOME", path.join(resolveHome(), ".config"));

const resolveStateHome = () =>
  resolveXdgBase("XDG_STATE_HOME", path.join(resolveHome(), ".local", "state"));

const resolveAppDir = (baseDir: string) => path.join(baseDir, "vde", "monitor");

export const resolveConfigDir = () => resolveAppDir(resolveConfigHome());
export const resolveStateDir = () => resolveAppDir(resolveStateHome());
