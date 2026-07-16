import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fsConstants from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";

import type { FileHandle } from "node:fs/promises";

import { runPaneLogWriter } from "./pane-log-writer";

export const PANE_LOG_DAEMON_PROTOCOL_VERSION = 1;
export const PANE_LOG_DAEMON_MAX_LINE_BYTES = 64 * 1024;

const execFileAsync = promisify(execFile);

export type PaneLogDaemonEndpoint = {
  fifoPath: string;
  readyPath: string;
};

type SessionState = "preparing" | "active" | "closing" | "failed";

type PaneLogSession = PaneLogDaemonEndpoint & {
  paneId: string;
  logPath: string;
  state: SessionState;
  sentinel: FileHandle | null;
  readerHandle: FileHandle;
  reader: Readable;
  completion: Promise<void>;
};

type DaemonRequest = {
  id: string;
  protocolVersion: number;
  serverIdentity?: string;
  type: string;
  paneId?: string;
  logPath?: string;
  maxBytes?: number;
  retain?: number;
};

type DaemonResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
};

type RunPaneLogDaemonOptions = {
  runtimeDir: string;
  serverIdentity: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const validatePositiveSafeInteger = (value: unknown, name: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return Number(value);
};

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
};

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const writeDaemonLog = (event: string, fields: Record<string, unknown> = {}) => {
  console.error(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
};

const connectToSocket = async (socketPath: string): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    const finish = (connected: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(200, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

const acquireStartupLock = async (lockPath: string): Promise<() => Promise<void>> => {
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(String(process.pid));
      } catch (error) {
        await handle.close().catch(() => undefined);
        await fs.unlink(lockPath).catch(() => undefined);
        throw error;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await handle.close().catch(() => undefined);
        await fs.unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    const [ownerText, stat] = await Promise.all([
      fs.readFile(lockPath, "utf8").catch(() => ""),
      fs.stat(lockPath).catch(() => null),
    ]);
    const ownerPid = /^\d+$/.test(ownerText) ? Number(ownerText) : null;
    const staleOwner =
      (stat != null &&
        ownerPid != null &&
        Number.isSafeInteger(ownerPid) &&
        !isProcessAlive(ownerPid)) ||
      (ownerPid == null && stat != null && Date.now() - stat.mtimeMs >= 500);
    if (staleOwner) {
      const currentStat = await fs.lstat(lockPath).catch(() => null);
      if (
        currentStat != null &&
        stat != null &&
        currentStat.dev === stat.dev &&
        currentStat.ino === stat.ino
      ) {
        await fs.unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      continue;
    }
    if (Date.now() >= deadline) throw new Error("pane log daemon startup lock timed out");
    await sleep(25);
  }
};

const waitForReadyFile = async (readyPath: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const stat = await fs.lstat(readyPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat != null) {
      if (!stat.isFile()) throw new Error("relay ready path is not a regular file");
      return;
    }
    if (Date.now() >= deadline) throw new Error("relay ready timeout");
    await sleep(10);
  }
};

const closeHandle = async (handle: FileHandle | null) => {
  if (handle == null) return;
  await handle.close().catch(() => undefined);
};

const createNonBlockingFifoReadable = (handle: FileHandle): Readable => {
  const chunks = async function* () {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let retryDelayMs = 2;
    while (true) {
      let bytesRead: number;
      try {
        ({ bytesRead } = await handle.read(buffer, 0, buffer.length, null));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EAGAIN") {
          await sleep(retryDelayMs);
          retryDelayMs = Math.min(retryDelayMs * 2, 50);
          continue;
        }
        throw error;
      }
      if (bytesRead === 0) return;
      retryDelayMs = 2;
      yield Buffer.from(buffer.subarray(0, bytesRead));
    }
  };
  return Readable.from(chunks(), { objectMode: false });
};

export const runPaneLogDaemon = async ({
  runtimeDir,
  serverIdentity,
}: RunPaneLogDaemonOptions): Promise<void> => {
  if (!path.isAbsolute(runtimeDir)) throw new Error("runtimeDir must be absolute");
  if (!/^[a-f0-9]{64}$/.test(serverIdentity)) {
    throw new Error("serverIdentity must be a lowercase SHA-256 hex digest");
  }

  const socketPath = path.join(runtimeDir, "control.sock");
  if (Buffer.byteLength(socketPath) > 100) {
    throw new Error("pane log daemon socket path exceeds 100 bytes");
  }
  const sessionsDir = path.join(runtimeDir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true, mode: 0o700 });
  await fs.chmod(runtimeDir, 0o700);
  await fs.chmod(sessionsDir, 0o700);

  const releaseStartupLock = await acquireStartupLock(path.join(runtimeDir, "startup.lock"));
  try {
    if (await connectToSocket(socketPath)) {
      await releaseStartupLock();
      return;
    }
    await fs.unlink(socketPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    const staleSessionEntries = await fs.readdir(sessionsDir);
    await Promise.all(
      staleSessionEntries.map((entry) => fs.rm(path.join(sessionsDir, entry), { force: true })),
    );
  } catch (error) {
    await releaseStartupLock();
    throw error;
  }

  const instanceId = randomUUID();
  const sessions = new Map<string, PaneLogSession>();
  let shuttingDown = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveShutdown!: () => void;
  const shutdown = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const clearIdleTimer = () => {
    if (idleTimer == null) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  };

  const scheduleIdleShutdown = () => {
    clearIdleTimer();
    if (shuttingDown || sessions.size > 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (shuttingDown || sessions.size > 0) return;
      shuttingDown = true;
      resolveShutdown();
    }, 60_000);
    idleTimer.unref();
  };

  const cleanupSession = async (session: PaneLogSession) => {
    await closeHandle(session.sentinel);
    session.sentinel = null;
    session.reader.destroy();
    await closeHandle(session.readerHandle);
    await Promise.allSettled([fs.unlink(session.fifoPath), fs.unlink(session.readyPath)]);
    if (sessions.get(session.logPath) === session) sessions.delete(session.logPath);
    scheduleIdleShutdown();
  };

  const registerUnlocked = async (request: DaemonRequest): Promise<PaneLogDaemonEndpoint> => {
    clearIdleTimer();
    const paneId = requireString(request.paneId, "paneId");
    const logPath = requireString(request.logPath, "logPath");
    if (!path.isAbsolute(logPath)) throw new Error("logPath must be absolute");
    const maxBytes = validatePositiveSafeInteger(request.maxBytes, "maxBytes");
    const retain = validatePositiveSafeInteger(request.retain, "retain");
    const existing = sessions.get(logPath);
    if (existing != null && (existing.state === "preparing" || existing.state === "active")) {
      if (existing.paneId !== paneId) throw new Error("logPath is registered by another pane");
      return { fifoPath: existing.fifoPath, readyPath: existing.readyPath };
    }

    const logHash = createHash("sha256").update(logPath).digest("hex").slice(0, 24);
    const prefix = `${logHash}.${randomUUID()}`;
    const fifoPath = path.join(sessionsDir, `${prefix}.fifo`);
    const readyPath = path.join(sessionsDir, `${prefix}.ready`);
    await execFileAsync("mkfifo", ["-m", "600", fifoPath]);

    let sentinel: FileHandle | null = null;
    let readerHandle: FileHandle | null = null;
    let reader: Readable | null = null;
    try {
      sentinel = await fs.open(fifoPath, fsConstants.constants.O_RDWR);
      readerHandle = await fs.open(
        fifoPath,
        fsConstants.constants.O_RDONLY | fsConstants.constants.O_NONBLOCK,
      );
      reader = createNonBlockingFifoReadable(readerHandle);

      let resolveReady!: () => void;
      let rejectReady!: (error: unknown) => void;
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      const session = {
        paneId,
        logPath,
        fifoPath,
        readyPath,
        state: "preparing" as SessionState,
        sentinel,
        readerHandle,
        reader,
        completion: Promise.resolve(),
      };
      sessions.set(logPath, session);
      session.completion = runPaneLogWriter({
        input: reader,
        logPath,
        maxBytes,
        retain,
        onReady: resolveReady,
      })
        .catch((error) => {
          session.state = "failed";
          rejectReady(error);
          writeDaemonLog("session-failed", {
            instanceId,
            paneId,
            logPath,
            error: toErrorMessage(error),
          });
        })
        .finally(async () => {
          await cleanupSession(session);
          writeDaemonLog("session-closed", { instanceId, paneId, logPath });
        });
      await ready;
      writeDaemonLog("session-registered", { instanceId, paneId, logPath });
      return { fifoPath, readyPath };
    } catch (error) {
      reader?.destroy();
      await closeHandle(readerHandle);
      await closeHandle(sentinel);
      await Promise.allSettled([fs.unlink(fifoPath), fs.unlink(readyPath)]);
      throw error;
    }
  };

  let registrationQueue = Promise.resolve();
  const register = (request: DaemonRequest): Promise<PaneLogDaemonEndpoint> => {
    const registration = registrationQueue
      .then(() => registerUnlocked(request))
      .finally(scheduleIdleShutdown);
    registrationQueue = registration.then(
      () => undefined,
      () => undefined,
    );
    return registration;
  };

  const activate = async (request: DaemonRequest) => {
    const logPath = requireString(request.logPath, "logPath");
    const session = sessions.get(logPath);
    if (session == null) throw new Error("pane log session is absent");
    await waitForReadyFile(session.readyPath, 5_000);
    await closeHandle(session.sentinel);
    session.sentinel = null;
    session.state = "active";
    writeDaemonLog("session-active", {
      instanceId,
      paneId: session.paneId,
      logPath: session.logPath,
    });
  };

  const closeSession = async (request: DaemonRequest) => {
    const logPath = requireString(request.logPath, "logPath");
    const session = sessions.get(logPath);
    if (session == null) return;
    session.state = "closing";
    await closeHandle(session.sentinel);
    session.sentinel = null;
    await session.completion;
  };

  const abortSession = async (request: DaemonRequest) => {
    const logPath = requireString(request.logPath, "logPath");
    const session = sessions.get(logPath);
    if (session == null) return;
    session.state = "closing";
    await closeHandle(session.sentinel);
    session.sentinel = null;
    session.reader.destroy();
    await session.completion;
  };

  const status = (request: DaemonRequest) => {
    const logPath = requireString(request.logPath, "logPath");
    return { state: sessions.get(logPath)?.state ?? "absent" };
  };

  const dispatch = async (request: DaemonRequest): Promise<unknown> => {
    if (request.protocolVersion !== PANE_LOG_DAEMON_PROTOCOL_VERSION) {
      throw new Error("pane log daemon protocol version mismatch");
    }
    if (request.type !== "hello" && request.serverIdentity !== serverIdentity) {
      throw new Error("pane log daemon server identity mismatch");
    }
    switch (request.type) {
      case "hello":
        return {
          protocolVersion: PANE_LOG_DAEMON_PROTOCOL_VERSION,
          serverIdentity,
          pid: process.pid,
          instanceId,
          sessions: [...sessions.values()].map((session) => ({
            paneId: session.paneId,
            logPath: session.logPath,
            state: session.state,
          })),
        };
      case "register":
        if (shuttingDown) throw new Error("pane log daemon is shutting down");
        return register(request);
      case "activate":
        return activate(request);
      case "abort":
        return abortSession(request);
      case "release":
        return closeSession(request);
      case "status":
        return status(request);
      case "shutdown":
        if (!shuttingDown) {
          shuttingDown = true;
          void Promise.allSettled(
            [...sessions.values()].map(async (session) => {
              session.state = "closing";
              await closeHandle(session.sentinel);
              session.sentinel = null;
              await session.completion;
            }),
          ).then(resolveShutdown);
        }
        return { shuttingDown: true };
      default:
        throw new Error(`unknown pane log daemon request: ${request.type}`);
    }
  };

  const server = net.createServer((socket) => {
    let buffered = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length > PANE_LOG_DAEMON_MAX_LINE_BYTES && !buffered.includes(0x0a)) {
        socket.destroy(new Error("pane log daemon request exceeds 64 KiB"));
        return;
      }
      while (true) {
        const newline = buffered.indexOf(0x0a);
        if (newline < 0) break;
        const line = buffered.subarray(0, newline);
        buffered = buffered.subarray(newline + 1);
        if (line.length > PANE_LOG_DAEMON_MAX_LINE_BYTES) {
          socket.destroy(new Error("pane log daemon request exceeds 64 KiB"));
          return;
        }
        let request: DaemonRequest;
        try {
          request = JSON.parse(line.toString("utf8")) as DaemonRequest;
          requireString(request.id, "id");
        } catch (error) {
          const response: DaemonResponse = {
            id: "",
            ok: false,
            error: { code: "INVALID_REQUEST", message: toErrorMessage(error) },
          };
          socket.write(`${JSON.stringify(response)}\n`);
          continue;
        }
        void dispatch(request).then(
          (result) => {
            const response: DaemonResponse = { id: request.id, ok: true, result };
            socket.write(`${JSON.stringify(response)}\n`);
          },
          (error) => {
            const response: DaemonResponse = {
              id: request.id,
              ok: false,
              error: { code: "REQUEST_FAILED", message: toErrorMessage(error) },
            };
            socket.write(`${JSON.stringify(response)}\n`);
          },
        );
      }
    });
    socket.on("error", () => undefined);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await fs.chmod(socketPath, 0o600);
  } catch (error) {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await fs.unlink(socketPath).catch(() => undefined);
    await releaseStartupLock();
    throw error;
  }
  await releaseStartupLock();
  writeDaemonLog("daemon-started", { instanceId, serverIdentity, pid: process.pid });
  scheduleIdleShutdown();

  await shutdown;
  clearIdleTimer();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.unlink(socketPath).catch(() => undefined);
  writeDaemonLog("daemon-stopped", { instanceId, serverIdentity, pid: process.pid });
};
