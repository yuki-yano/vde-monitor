import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { MultiplexerBackend } from "@vde-monitor/multiplexer";

export type MonitorRuntimeMarker = {
  backend: MultiplexerBackend;
  serverKey: string;
  pid: number;
  processStartedAt: string;
};

type ReadProcessStartedAt = (pid: number) => {
  error?: Error;
  status: number | null;
  stdout: string;
};

const readProcessStartedAt: ReadProcessStartedAt = (pid) => {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  return { error: result.error, status: result.status, stdout: result.stdout };
};

export const resolveProcessStartedAt = (
  pid: number,
  read: ReadProcessStartedAt = readProcessStartedAt,
): string => {
  const result = read(pid);
  const startedAt = result.status === 0 ? result.stdout.trim() : "";
  if (result.error || startedAt.length === 0) {
    throw new Error(`failed to resolve process start identity for pid ${pid}`);
  }
  return startedAt;
};

const isOwnedMarker = (value: unknown, expected: MonitorRuntimeMarker): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Record<string, unknown>;
  return (
    marker.backend === expected.backend &&
    marker.serverKey === expected.serverKey &&
    marker.pid === expected.pid &&
    marker.processStartedAt === expected.processStartedAt
  );
};

export const createMonitorRuntimeMarker = ({
  markerPath,
  marker,
}: {
  markerPath: string;
  marker: MonitorRuntimeMarker;
}) => {
  if (path.basename(markerPath) !== `.runtime.${marker.pid}.json`) {
    throw new Error("runtime marker path must be owned by its process id");
  }

  const write = async (): Promise<void> => {
    const markerDir = path.dirname(markerPath);
    await fs.mkdir(markerDir, { recursive: true, mode: 0o700 });
    const temporaryPath = `${markerPath}.${marker.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(marker)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temporaryPath, markerPath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };

  const removeIfOwned = async (): Promise<boolean> => {
    let raw: string;
    try {
      raw = await fs.readFile(markerPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!isOwnedMarker(parsed, marker)) return false;

    try {
      await fs.unlink(markerPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };

  return { write, removeIfOwned };
};
