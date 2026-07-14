import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveProcessStartedAt } from "./monitor/runtime-marker";

export type ServerRuntimeEndpoint = {
  host: string;
  port: number;
};

export type ServerRuntimeMarker = {
  version: 1;
  instanceId: string;
  pid: number;
  processStartedAt: string;
  endpoint: ServerRuntimeEndpoint | null;
};

type RuntimeMarkerDeps = {
  readProcessStartedAt?: (pid: number) => string;
  isProcessRunning?: (pid: number) => boolean;
};

type ActiveRuntimeMarker = {
  marker: ServerRuntimeMarker;
  verified: boolean;
};

const SERVER_RUNTIME_FILE_PATTERN = /^server-runtime\.(\d+)\.([0-9a-f-]+)\.json$/i;
const SERVER_RUNTIME_INSTANCE_PATTERN = /^[0-9a-f-]+$/i;

const getServerRuntimeMarkerDirectory = () =>
  path.join(os.homedir(), ".vde-monitor", "server-runtimes");

const isServerRuntimeEndpoint = (value: unknown): value is ServerRuntimeEndpoint => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const endpoint = value as Record<string, unknown>;
  return (
    typeof endpoint.host === "string" &&
    endpoint.host.trim().length > 0 &&
    typeof endpoint.port === "number" &&
    Number.isSafeInteger(endpoint.port) &&
    endpoint.port >= 1 &&
    endpoint.port <= 65535
  );
};

const isServerRuntimeMarker = (value: unknown): value is ServerRuntimeMarker => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return (
    marker.version === 1 &&
    typeof marker.instanceId === "string" &&
    SERVER_RUNTIME_INSTANCE_PATTERN.test(marker.instanceId) &&
    typeof marker.pid === "number" &&
    Number.isSafeInteger(marker.pid) &&
    marker.pid > 0 &&
    typeof marker.processStartedAt === "string" &&
    marker.processStartedAt.length > 0 &&
    (marker.endpoint === null || isServerRuntimeEndpoint(marker.endpoint))
  );
};

const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const writeMarkerAtomically = async (markerPath: string, marker: ServerRuntimeMarker) => {
  const temporaryPath = `${markerPath}.${randomUUID()}.tmp`;
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

const removeMarker = async (markerPath: string) => {
  await fs.rm(markerPath, { force: true }).catch(() => undefined);
};

const listActiveRuntimeMarkers = async ({
  markerDirectory,
  excludeMarkerPath,
  readProcessStartedAt = resolveProcessStartedAt,
  isProcessRunning: checkProcessRunning = isProcessRunning,
}: {
  markerDirectory: string;
  excludeMarkerPath?: string;
} & RuntimeMarkerDeps): Promise<ActiveRuntimeMarker[]> => {
  let entries: string[];
  try {
    entries = await fs.readdir(markerDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const activeMarkers: ActiveRuntimeMarker[] = [];
  for (const entry of entries) {
    const fileMatch = entry.match(SERVER_RUNTIME_FILE_PATTERN);
    if (fileMatch === null) continue;
    const markerPath = path.join(markerDirectory, entry);
    if (markerPath === excludeMarkerPath) continue;

    let raw: string;
    try {
      raw = await fs.readFile(markerPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    let marker: ServerRuntimeMarker;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isServerRuntimeMarker(parsed)) {
        await removeMarker(markerPath);
        continue;
      }
      marker = parsed;
      if (marker.pid !== Number(fileMatch[1]) || marker.instanceId !== fileMatch[2]) {
        await removeMarker(markerPath);
        continue;
      }
    } catch {
      await removeMarker(markerPath);
      continue;
    }

    if (!checkProcessRunning(marker.pid)) {
      await removeMarker(markerPath);
      continue;
    }

    let actualProcessStartedAt: string;
    try {
      actualProcessStartedAt = readProcessStartedAt(marker.pid);
    } catch {
      // A live process whose identity cannot be inspected is treated as an active owner.
      // This fails closed and never permits a second server merely because inspection failed.
      activeMarkers.push({ marker, verified: false });
      continue;
    }
    if (actualProcessStartedAt !== marker.processStartedAt) {
      await removeMarker(markerPath);
      continue;
    }
    activeMarkers.push({ marker, verified: true });
  }
  return activeMarkers;
};

export const createServerRuntimeMarker = ({
  pid,
  processStartedAt,
  instanceId = randomUUID(),
  markerDirectory = getServerRuntimeMarkerDirectory(),
  readProcessStartedAt,
  isProcessRunning: checkProcessRunning,
}: {
  pid: number;
  processStartedAt: string;
  instanceId?: string;
  markerDirectory?: string;
} & RuntimeMarkerDeps) => {
  const markerPath = path.join(markerDirectory, `server-runtime.${pid}.${instanceId}.json`);
  let marker: ServerRuntimeMarker = {
    version: 1,
    instanceId,
    pid,
    processStartedAt,
    endpoint: null,
  };
  if (!isServerRuntimeMarker(marker)) {
    throw new Error("invalid server runtime marker");
  }
  let claimed = false;

  const removeIfOwned = async (): Promise<boolean> => {
    let persisted: unknown;
    try {
      persisted = JSON.parse(await fs.readFile(markerPath, "utf8"));
    } catch {
      claimed = false;
      return false;
    }
    if (
      !isServerRuntimeMarker(persisted) ||
      persisted.instanceId !== marker.instanceId ||
      persisted.pid !== marker.pid ||
      persisted.processStartedAt !== marker.processStartedAt
    ) {
      claimed = false;
      return false;
    }
    await fs.rm(markerPath, { force: true });
    claimed = false;
    return true;
  };

  const claim = async (): Promise<void> => {
    if (claimed) return;
    await fs.mkdir(markerDirectory, { recursive: true, mode: 0o700 });
    await writeMarkerAtomically(markerPath, marker);
    claimed = true;

    try {
      // Every contender publishes its own complete marker before scanning. A later contender sees
      // the earlier marker; contenders published before either scan may both reject, but can never
      // both complete the claim successfully.
      const otherActiveMarkers = await listActiveRuntimeMarkers({
        markerDirectory,
        excludeMarkerPath: markerPath,
        readProcessStartedAt,
        isProcessRunning: checkProcessRunning,
      });
      if (otherActiveMarkers.length === 0) return;
      throw new Error("another vde-monitor server is already running");
    } catch (error) {
      await removeIfOwned().catch(() => undefined);
      throw error;
    }
  };

  const publish = async (endpoint: ServerRuntimeEndpoint): Promise<void> => {
    if (!claimed) {
      throw new Error("server runtime marker must be claimed before publishing");
    }
    if (!isServerRuntimeEndpoint(endpoint)) {
      throw new Error("invalid server runtime endpoint");
    }
    marker = { ...marker, endpoint: { ...endpoint } };
    await writeMarkerAtomically(markerPath, marker);
  };

  return { claim, publish, removeIfOwned };
};

export const readActiveServerRuntimeEndpoint = async ({
  markerDirectory = getServerRuntimeMarkerDirectory(),
  readProcessStartedAt,
  isProcessRunning: checkProcessRunning,
}: {
  markerDirectory?: string;
} & RuntimeMarkerDeps = {}): Promise<ServerRuntimeEndpoint> => {
  const activeMarkers = await listActiveRuntimeMarkers({
    markerDirectory,
    readProcessStartedAt,
    isProcessRunning: checkProcessRunning,
  });
  if (activeMarkers.length === 0) {
    throw new Error("no active vde-monitor server runtime was found");
  }
  if (activeMarkers.length > 1) {
    throw new Error("multiple active vde-monitor server runtimes were found");
  }
  const active = activeMarkers[0];
  if (!active?.verified) {
    throw new Error("vde-monitor server runtime identity could not be verified");
  }
  if (active.marker.endpoint === null) {
    throw new Error("vde-monitor server is still starting");
  }
  return { ...active.marker.endpoint };
};
