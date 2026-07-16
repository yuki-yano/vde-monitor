import fsConstants from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PANE_LOG_DAEMON_PROTOCOL_VERSION, runPaneLogDaemon } from "./pane-log-daemon";

const serverIdentity = "a".repeat(64);
const cleanupPaths: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async <Result>(
  socketPath: string,
  type: string,
  payload: Record<string, unknown> = {},
  expectedServerIdentity = serverIdentity,
): Promise<Result> =>
  new Promise((resolve, reject) => {
    const id = `${type}-${Date.now()}-${Math.random()}`;
    const socket = net.createConnection(socketPath);
    let buffered = "";
    socket.setTimeout(5_000, () => socket.destroy(new Error("request timeout")));
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({ id, protocolVersion: PANE_LOG_DAEMON_PROTOCOL_VERSION, serverIdentity: expectedServerIdentity, type, ...payload })}\n`,
      );
    });
    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      const response = JSON.parse(buffered.slice(0, newline)) as {
        id: string;
        ok: boolean;
        result: Result;
        error?: { message: string };
      };
      socket.destroy();
      if (!response.ok) reject(new Error(response.error?.message ?? "request failed"));
      else resolve(response.result);
    });
  });

const waitForSocket = async (socketPath: string) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await request(socketPath, "hello");
      return;
    } catch {
      await sleep(10);
    }
  }
  throw new Error("daemon socket did not become ready");
};

const listLogFilesOldestFirst = async (logPath: string) => {
  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  const names = await fs.readdir(dir);
  const rotations = names
    .filter((name) => name.startsWith(`${base}.`))
    .sort((left, right) => Number(left.split(".").at(-2)) - Number(right.split(".").at(-2)));
  return [...rotations.map((name) => path.join(dir, name)), logPath];
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.allSettled(
    cleanupPaths.splice(0).map((entry) => fs.rm(entry, { recursive: true })),
  );
});

describe("pane log daemon", () => {
  it("writes binary FIFO input across rotations and cleans session resources", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vde-pane-log-daemon-"));
    cleanupPaths.push(root);
    const runtimeDir = path.join(root, "runtime");
    const logsDir = path.join(root, "logs");
    const logPath = path.join(logsDir, "pane.log");
    await fs.mkdir(logsDir);
    const socketPath = path.join(runtimeDir, "control.sock");
    const daemon = runPaneLogDaemon({ runtimeDir, serverIdentity });
    await waitForSocket(socketPath);

    const hello = await request<{ serverIdentity: string; pid: number }>(socketPath, "hello");
    expect(hello.serverIdentity).toBe(serverIdentity);
    expect(hello.pid).toBe(process.pid);

    const endpoint = await request<{ fifoPath: string; readyPath: string }>(
      socketPath,
      "register",
      { paneId: "%1", logPath, maxBytes: 4, retain: 5 },
    );
    const fifoStat = await fs.lstat(endpoint.fifoPath);
    expect(fifoStat.isFIFO()).toBe(true);
    expect(fifoStat.mode & 0o777).toBe(0o600);

    const relay = await fs.open(endpoint.fifoPath, fsConstants.constants.O_WRONLY);
    await fs.writeFile(endpoint.readyPath, Buffer.alloc(0), { mode: 0o600 });
    await request(socketPath, "activate", { logPath });
    const input = Buffer.from([0x00, 0xff, 0x1b, 0x5b, 0x31, 0x6d, 0x80, 0x0a, 0x41, 0x42]);
    await relay.write(input);
    await relay.close();

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const state = await request<{ state: string }>(socketPath, "status", { logPath });
      if (state.state === "absent") break;
      await sleep(10);
    }
    expect((await request<{ state: string }>(socketPath, "status", { logPath })).state).toBe(
      "absent",
    );
    const files = await listLogFilesOldestFirst(logPath);
    const actual = Buffer.concat(await Promise.all(files.map((file) => fs.readFile(file))));
    expect(actual).toEqual(input);
    expect(files).toHaveLength(3);
    await expect(fs.lstat(endpoint.fifoPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.lstat(endpoint.readyPath)).rejects.toMatchObject({ code: "ENOENT" });

    await request(socketPath, "shutdown");
    await daemon;
    await expect(fs.lstat(socketPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the FIFO reader alive before relay readiness and aborts cleanly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vde-pane-log-daemon-"));
    cleanupPaths.push(root);
    const runtimeDir = path.join(root, "runtime");
    const logsDir = path.join(root, "logs");
    const logPath = path.join(logsDir, "pane.log");
    await fs.mkdir(logsDir);
    const socketPath = path.join(runtimeDir, "control.sock");
    const daemon = runPaneLogDaemon({ runtimeDir, serverIdentity });
    await waitForSocket(socketPath);

    const endpoint = await request<{ fifoPath: string; readyPath: string }>(
      socketPath,
      "register",
      { paneId: "%1", logPath, maxBytes: 2_000_000, retain: 5 },
    );
    await sleep(30);
    expect((await request<{ state: string }>(socketPath, "status", { logPath })).state).toBe(
      "preparing",
    );
    await request(socketPath, "abort", { logPath });
    expect((await request<{ state: string }>(socketPath, "status", { logPath })).state).toBe(
      "absent",
    );
    await expect(fs.lstat(endpoint.fifoPath)).rejects.toMatchObject({ code: "ENOENT" });

    await request(socketPath, "shutdown");
    await daemon;
  });

  it("prepares more FIFO sessions than the libuv threadpool size", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vde-pane-log-daemon-"));
    cleanupPaths.push(root);
    const runtimeDir = path.join(root, "runtime");
    const logsDir = path.join(root, "logs");
    await fs.mkdir(logsDir);
    const socketPath = path.join(runtimeDir, "control.sock");
    const daemon = runPaneLogDaemon({ runtimeDir, serverIdentity });
    await waitForSocket(socketPath);

    const logPaths = Array.from({ length: 8 }, (_, index) => path.join(logsDir, `${index}.log`));
    for (const [index, logPath] of logPaths.entries()) {
      await request(socketPath, "register", {
        paneId: `%${index}`,
        logPath,
        maxBytes: 2_000_000,
        retain: 5,
      });
    }
    const hello = await request<{ sessions: Array<{ state: string }> }>(socketPath, "hello");
    expect(hello.sessions).toHaveLength(8);
    expect(hello.sessions.every(({ state }) => state === "preparing")).toBe(true);

    for (const logPath of logPaths) await request(socketPath, "abort", { logPath });
    await request(socketPath, "shutdown");
    await daemon;
  });

  it("removes stale session resources while recovering a dead startup owner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vde-pane-log-daemon-"));
    cleanupPaths.push(root);
    const runtimeDir = path.join(root, "runtime");
    const sessionsDir = path.join(runtimeDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(path.join(runtimeDir, "startup.lock"), "99999999");
    await fs.writeFile(path.join(sessionsDir, "stale.fifo"), "stale");
    await fs.writeFile(path.join(sessionsDir, "stale.ready"), "stale");
    const socketPath = path.join(runtimeDir, "control.sock");

    const daemon = runPaneLogDaemon({ runtimeDir, serverIdentity });
    await waitForSocket(socketPath);
    await expect(fs.readdir(sessionsDir)).resolves.toEqual([]);
    await expect(fs.lstat(path.join(runtimeDir, "startup.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await request(socketPath, "shutdown");
    await daemon;
  });

  it("rejects invalid runtime and server identity inputs", async () => {
    await expect(runPaneLogDaemon({ runtimeDir: "relative", serverIdentity })).rejects.toThrow(
      "runtimeDir must be absolute",
    );
    await expect(
      runPaneLogDaemon({ runtimeDir: "/tmp/daemon", serverIdentity: "invalid" }),
    ).rejects.toThrow("serverIdentity must be a lowercase SHA-256");
  });
});
