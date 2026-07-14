import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureDir, writeFileAtomic } from "./infra/config/config-io";

const getTokenDir = () => {
  return path.join(os.homedir(), ".vde-monitor");
};

const getTokenPath = () => {
  return path.join(getTokenDir(), "token.json");
};

export const generateToken = () => {
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

export const saveToken = (token: string) => {
  const dir = getTokenDir();
  ensureDir(dir);
  writeFileAtomic(getTokenPath(), `${JSON.stringify({ token }, null, 2)}\n`);
};

export const ensureToken = () => {
  const existing = loadToken();
  if (existing) {
    return existing;
  }
  const token = generateToken();
  saveToken(token);
  return token;
};
