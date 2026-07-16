import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPaneLogDaemonClient } from "./pane-log-daemon-client";
import { runPaneLogDaemon } from "./pane-log-daemon";

const cleanupPaths: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveRuntime = (baseDir: string, serverKey: string) => {
  const serverIdentity = createHash("sha256").update(serverKey).digest("hex");
  return {
    runtimeDir: path.join(baseDir, "run", "pane-log", serverIdentity.slice(0, 24)),
    serverIdentity,
  };
};

const waitForSocket = async (socketPath: string) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(socketPath);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await sleep(10);
  }
  throw new Error("daemon socket did not become ready");
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.allSettled(
    cleanupPaths.splice(0).map((entry) => fs.rm(entry, { recursive: true })),
  );
});

describe("pane log daemon client", () => {
  it("treats a prepared session as healthy during the attach handshake", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const baseDir = await fs.mkdtemp("/tmp/vpc-");
    cleanupPaths.push(baseDir);
    const serverKey = "test-server";
    const { runtimeDir, serverIdentity } = resolveRuntime(baseDir, serverKey);
    const daemon = runPaneLogDaemon({ runtimeDir, serverIdentity });
    await waitForSocket(path.join(runtimeDir, "control.sock"));
    const client = createPaneLogDaemonClient({
      baseDir,
      serverKey,
      daemonBaseCommand: ["/does/not/run"],
    });
    const logPath = path.join(baseDir, "pane.log");

    await client.prepare("%1", logPath);
    await expect(client.isHealthy("%1", logPath)).resolves.toBe(true);
    await client.abort("%1", logPath);
    await client.dispose();
    await daemon;
  });

  it("rejects a live daemon with a different full server identity without spawning", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const baseDir = await fs.mkdtemp("/tmp/vpc-");
    cleanupPaths.push(baseDir);
    const serverKey = "test-server";
    const { runtimeDir } = resolveRuntime(baseDir, serverKey);
    const daemon = runPaneLogDaemon({ runtimeDir, serverIdentity: "b".repeat(64) });
    await waitForSocket(path.join(runtimeDir, "control.sock"));
    const client = createPaneLogDaemonClient({
      baseDir,
      serverKey,
      daemonBaseCommand: ["/does/not/run"],
    });

    await expect(client.prepare("%1", path.join(baseDir, "pane.log"))).rejects.toThrow(
      "server identity mismatch",
    );
    await expect(client.dispose()).rejects.toThrow("server identity mismatch");
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(path.join(runtimeDir, "control.sock"));
      const id = "shutdown";
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write(
          `${JSON.stringify({ id, protocolVersion: 1, serverIdentity: "b".repeat(64), type: "shutdown" })}\n`,
        );
      });
      socket.once("data", () => {
        socket.destroy();
        resolve();
      });
    });
    await daemon;
  });

  it("reports daemon executable spawn failures", async () => {
    const baseDir = await fs.mkdtemp("/tmp/vpc-");
    cleanupPaths.push(baseDir);
    const client = createPaneLogDaemonClient({
      baseDir,
      serverKey: "test-server",
      daemonBaseCommand: [path.join(baseDir, "missing-daemon")],
    });

    await expect(client.prepare("%1", path.join(baseDir, "pane.log"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
