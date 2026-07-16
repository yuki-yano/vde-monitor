import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import type { PaneLogTransport } from "@vde-monitor/tmux";

import {
  PANE_LOG_DAEMON_MAX_LINE_BYTES,
  PANE_LOG_DAEMON_PROTOCOL_VERSION,
} from "./pane-log-daemon";

type PaneLogDaemonClientOptions = {
  baseDir: string;
  serverKey: string;
  daemonBaseCommand: readonly string[];
  runtimeScope?: string;
};

type DaemonResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
};

type HelloResult = {
  protocolVersion: number;
  serverIdentity: string;
  pid: number;
  instanceId: string;
};

class PaneLogDaemonCompatibilityError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPathInside = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const request = async <Result>({
  socketPath,
  serverIdentity,
  type,
  payload = {},
  timeoutMs = 5_000,
}: {
  socketPath: string;
  serverIdentity: string;
  type: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<Result> => {
  const id = randomUUID();
  return new Promise<Result>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    let buffered = Buffer.alloc(0);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      callback();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`pane log daemon ${type} request timed out`))),
      timeoutMs,
    );
    socket.once("error", (error) => finish(() => reject(error)));
    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({ id, protocolVersion: PANE_LOG_DAEMON_PROTOCOL_VERSION, serverIdentity, type, ...payload })}\n`,
      );
    });
    socket.on("data", (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length > PANE_LOG_DAEMON_MAX_LINE_BYTES) {
        finish(() => reject(new Error("pane log daemon response exceeds 64 KiB")));
        return;
      }
      const newline = buffered.indexOf(0x0a);
      if (newline < 0) return;
      try {
        const response = JSON.parse(
          buffered.subarray(0, newline).toString("utf8"),
        ) as DaemonResponse;
        if (response.id !== id) throw new Error("pane log daemon response id mismatch");
        if (!response.ok)
          throw new Error(response.error?.message ?? "pane log daemon request failed");
        finish(() => resolve(response.result as Result));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
};

export const createPaneLogDaemonClient = ({
  baseDir,
  serverKey,
  daemonBaseCommand,
  runtimeScope,
}: PaneLogDaemonClientOptions): PaneLogTransport & {
  runtimeDir: string;
  serverIdentity: string;
} => {
  if (daemonBaseCommand.length === 0) throw new Error("pane log daemon command must not be empty");
  if (runtimeScope != null && !/^[a-z0-9-]+$/.test(runtimeScope)) {
    throw new Error("pane log daemon runtime scope is invalid");
  }
  const serverIdentity = createHash("sha256").update(serverKey).digest("hex");
  const runtimeName = [serverIdentity.slice(0, 24), runtimeScope].filter(Boolean).join("-");
  const runtimeDir = path.join(baseDir, "run", "pane-log", runtimeName);
  const sessionsDir = path.join(runtimeDir, "sessions");
  const socketPath = path.join(runtimeDir, "control.sock");
  if (Buffer.byteLength(socketPath) > 100) {
    throw new Error("pane log daemon socket path exceeds 100 bytes");
  }

  let ensurePromise: Promise<HelloResult> | null = null;

  const hello = async () => {
    const result = await request<HelloResult>({ socketPath, serverIdentity, type: "hello" });
    if (result.protocolVersion !== PANE_LOG_DAEMON_PROTOCOL_VERSION) {
      throw new PaneLogDaemonCompatibilityError("pane log daemon protocol version mismatch");
    }
    if (result.serverIdentity !== serverIdentity) {
      throw new PaneLogDaemonCompatibilityError("pane log daemon server identity mismatch");
    }
    return result;
  };

  const spawnDaemon = async () => {
    await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    await fs.chmod(runtimeDir, 0o700);
    const logPath = path.join(runtimeDir, "daemon.log");
    const logFd = fsSync.openSync(logPath, "a", 0o600);
    try {
      const executable = daemonBaseCommand[0];
      if (executable == null) throw new Error("pane log daemon command must not be empty");
      const child = spawn(
        executable,
        [
          ...daemonBaseCommand.slice(1),
          "--runtime-dir",
          runtimeDir,
          "--server-identity",
          serverIdentity,
        ],
        {
          detached: true,
          stdio: ["ignore", "ignore", logFd] as const,
        },
      );
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
    } finally {
      fsSync.closeSync(logFd);
    }
  };

  const ensureDaemon = async (): Promise<HelloResult> => {
    if (ensurePromise != null) return ensurePromise;
    const pending = (async () => {
      try {
        return await hello();
      } catch (error) {
        if (error instanceof PaneLogDaemonCompatibilityError) throw error;
        await spawnDaemon();
      }
      const deadline = Date.now() + 5_000;
      let lastError: unknown = null;
      while (Date.now() < deadline) {
        try {
          return await hello();
        } catch (error) {
          lastError = error;
          await sleep(25);
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("pane log daemon did not become ready");
    })();
    ensurePromise = pending;
    try {
      return await pending;
    } finally {
      if (ensurePromise === pending) ensurePromise = null;
    }
  };

  const validateEndpoint = (endpoint: { fifoPath: string; readyPath: string }) => {
    if (!path.isAbsolute(endpoint.fifoPath) || !isPathInside(sessionsDir, endpoint.fifoPath)) {
      throw new Error("pane log daemon returned an invalid FIFO path");
    }
    if (!path.isAbsolute(endpoint.readyPath) || !isPathInside(sessionsDir, endpoint.readyPath)) {
      throw new Error("pane log daemon returned an invalid ready path");
    }
    return endpoint;
  };

  const prepare: PaneLogTransport["prepare"] = async (paneId, logPath) => {
    await ensureDaemon();
    const endpoint = await request<{ fifoPath: string; readyPath: string }>({
      socketPath,
      serverIdentity,
      type: "register",
      payload: { paneId, logPath, maxBytes: 2_000_000, retain: 5 },
    });
    return validateEndpoint(endpoint);
  };

  const activate: PaneLogTransport["activate"] = async (_paneId, logPath) => {
    await request({ socketPath, serverIdentity, type: "activate", payload: { logPath } });
  };

  const abort: PaneLogTransport["abort"] = async (_paneId, logPath) => {
    await request({
      socketPath,
      serverIdentity,
      type: "abort",
      payload: { logPath },
      timeoutMs: 10_000,
    });
  };

  const release: PaneLogTransport["release"] = async (_paneId, logPath) => {
    await request({
      socketPath,
      serverIdentity,
      type: "release",
      payload: { logPath },
      timeoutMs: 10_000,
    });
  };

  const isHealthy: PaneLogTransport["isHealthy"] = async (_paneId, logPath) => {
    try {
      const result = await request<{ state: string }>({
        socketPath,
        serverIdentity,
        type: "status",
        payload: { logPath },
      });
      return result.state === "preparing" || result.state === "active";
    } catch {
      return false;
    }
  };

  const dispose = async () => {
    try {
      await request({ socketPath, serverIdentity, type: "shutdown", timeoutMs: 10_000 });
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ECONNREFUSED") return;
      throw error;
    }
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const exists = await fs.lstat(socketPath).then(
        () => true,
        () => false,
      );
      if (!exists) return;
      await sleep(25);
    }
    throw new Error("pane log daemon did not stop within 10 seconds");
  };

  return { prepare, activate, abort, release, isHealthy, dispose, runtimeDir, serverIdentity };
};
