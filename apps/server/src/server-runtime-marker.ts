import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveProcessStartedAt } from "./monitor/runtime-marker";

export type ServerRuntimeEndpoint = {
  host: string;
  port: number;
};

export type ServerRuntimeMarker = ServerRuntimeEndpoint & {
  pid: number;
  processStartedAt: string;
};

const getServerRuntimeMarkerPath = () =>
  path.join(os.homedir(), ".vde-monitor", "server-runtime.json");

const isServerRuntimeMarker = (value: unknown): value is ServerRuntimeMarker => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return (
    typeof marker.host === "string" &&
    marker.host.trim().length > 0 &&
    typeof marker.port === "number" &&
    Number.isSafeInteger(marker.port) &&
    marker.port >= 1 &&
    marker.port <= 65535 &&
    typeof marker.pid === "number" &&
    Number.isSafeInteger(marker.pid) &&
    marker.pid > 0 &&
    typeof marker.processStartedAt === "string" &&
    marker.processStartedAt.length > 0
  );
};

export const createServerRuntimeMarker = ({
  marker,
  markerPath = getServerRuntimeMarkerPath(),
}: {
  marker: ServerRuntimeMarker;
  markerPath?: string;
}) => {
  if (!isServerRuntimeMarker(marker)) {
    throw new Error("invalid server runtime marker");
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

  return { write };
};

export const readActiveServerRuntimeEndpoint = async ({
  markerPath = getServerRuntimeMarkerPath(),
  readProcessStartedAt = resolveProcessStartedAt,
}: {
  markerPath?: string;
  readProcessStartedAt?: (pid: number) => string;
} = {}): Promise<ServerRuntimeEndpoint> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(markerPath, "utf8"));
  } catch (error) {
    throw new Error("no active vde-monitor server runtime was found", { cause: error });
  }
  if (!isServerRuntimeMarker(parsed)) {
    throw new Error("vde-monitor server runtime marker is invalid");
  }
  let processStartedAt: string;
  try {
    processStartedAt = readProcessStartedAt(parsed.pid);
  } catch (error) {
    throw new Error("vde-monitor server runtime marker is stale", { cause: error });
  }
  if (processStartedAt !== parsed.processStartedAt) {
    throw new Error("vde-monitor server runtime marker is stale");
  }
  return { host: parsed.host, port: parsed.port };
};
