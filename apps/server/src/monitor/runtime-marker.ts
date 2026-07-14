import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

const runProcessIdentityCommand = (
  command: string,
  args: string[],
): ReturnType<ReadProcessStartedAt> => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });
  return { error: result.error, status: result.status, stdout: result.stdout };
};

export const resolveProcessStartedAt = (
  pid: number,
  {
    platform = process.platform,
    run = runProcessIdentityCommand,
    readLinuxProcessStat = (targetPid: number) => readFileSync(`/proc/${targetPid}/stat`, "utf8"),
    readLinuxBootId = () => readFileSync("/proc/sys/kernel/random/boot_id", "utf8"),
  }: {
    platform?: NodeJS.Platform;
    run?: (command: string, args: string[]) => ReturnType<ReadProcessStartedAt>;
    readLinuxProcessStat?: (pid: number) => string;
    readLinuxBootId?: () => string;
  } = {},
): string => {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`invalid process id: ${pid}`);
  }
  if (platform === "linux") {
    let stat: string;
    let bootId: string;
    try {
      stat = readLinuxProcessStat(pid);
      bootId = readLinuxBootId().trim();
    } catch {
      throw new Error(`failed to resolve process start identity for pid ${pid}`);
    }
    // The command name in field 2 may contain spaces or parentheses, so split after its final `)`.
    // Tokens after that boundary start at field 3; process start ticks are field 22 (index 19).
    const commandEnd = stat.lastIndexOf(")");
    const startedAtTicks =
      commandEnd < 0
        ? undefined
        : stat
            .slice(commandEnd + 1)
            .trim()
            .split(/\s+/)[19];
    if (startedAtTicks == null || !/^\d+$/.test(startedAtTicks) || !/^[0-9a-f-]+$/i.test(bootId)) {
      throw new Error(`failed to resolve process start identity for pid ${pid}`);
    }
    return `linux:${bootId}:${startedAtTicks}`;
  }

  const command = platform === "win32" ? "powershell.exe" : "ps";
  const args =
    platform === "win32"
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$target = Get-Process -Id ${pid} -ErrorAction Stop; ($target.StartTime.ToUniversalTime()).Ticks`,
        ]
      : ["-p", String(pid), "-o", "lstart="];
  const result = run(command, args);
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
