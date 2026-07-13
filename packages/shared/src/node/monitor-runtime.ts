import { createHash } from "node:crypto";
import path from "node:path";

import {
  resolveHerdrServerKey,
  resolveServerKey,
  resolveWeztermServerKey,
  sanitizeServerKey,
} from "../paths";

export const resolveCmuxServerKey = (socketPath: string | null | undefined): string => {
  const normalizedSocketPath = socketPath?.trim() || "auto";
  const readablePrefix = sanitizeServerKey(`cmux:${normalizedSocketPath}`);
  const fingerprint = createHash("sha256").update(normalizedSocketPath).digest("hex").slice(0, 12);
  return `${readablePrefix}-${fingerprint}`;
};

export const resolveMonitorRuntimeMarkerDirectory = (baseDir: string, serverKey: string): string =>
  path.join(baseDir, "events", serverKey);

export const resolveMonitorRuntimeMarkerPath = (
  baseDir: string,
  serverKey: string,
  pid: number,
): string =>
  path.join(resolveMonitorRuntimeMarkerDirectory(baseDir, serverKey), `.runtime.${pid}.json`);

type MonitorServerKeyParams = {
  multiplexerBackend: "tmux" | "wezterm" | "herdr" | "cmux";
  tmuxSocketName: string | null;
  tmuxSocketPath: string | null;
  weztermTarget: string | null | undefined;
  herdrSocketPath?: string;
  cmuxSocketPath?: string | null;
};

export const resolveMonitorServerKey = ({
  multiplexerBackend,
  tmuxSocketName,
  tmuxSocketPath,
  weztermTarget,
  herdrSocketPath,
  cmuxSocketPath,
}: MonitorServerKeyParams): string => {
  if (multiplexerBackend === "herdr") {
    return resolveHerdrServerKey(herdrSocketPath ?? "default");
  }
  if (multiplexerBackend === "wezterm") {
    return resolveWeztermServerKey(weztermTarget);
  }
  if (multiplexerBackend === "cmux") {
    return resolveCmuxServerKey(cmuxSocketPath);
  }
  return resolveServerKey(tmuxSocketName, tmuxSocketPath);
};
