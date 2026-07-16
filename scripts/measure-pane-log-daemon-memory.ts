import { spawn, spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const paneCount = Number(process.argv[2] ?? "11");
if (!Number.isSafeInteger(paneCount) || paneCount <= 0) {
  throw new Error("pane count must be a positive safe integer");
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const entrypoint = path.join(repoRoot, "dist", "index.js");
const tempDirectory = await fs.mkdtemp("/tmp/vpl-mem-");
const runtimeDir = path.join(tempDirectory, "r");
const logsDir = path.join(tempDirectory, "l");
const socketPath = path.join(runtimeDir, "control.sock");
const identity = "b".repeat(64);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async <Result>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<Result> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const socket = net.createConnection(socketPath);
    let buffered = "";
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({ id, protocolVersion: 1, serverIdentity: identity, type, ...payload })}\n`,
      );
    });
    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      const response = JSON.parse(buffered.slice(0, newline)) as {
        ok: boolean;
        result: Result;
        error?: { message: string };
      };
      socket.destroy();
      if (response.ok) resolve(response.result);
      else reject(new Error(response.error?.message ?? "daemon request failed"));
    });
  });

const readRssKiB = (pid: number) => {
  const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
  const value = Number(result.stdout.trim());
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`cannot read RSS for ${pid}`);
  return value;
};

await fs.mkdir(logsDir);
const daemon = spawn(
  process.execPath,
  [
    entrypoint,
    "internal",
    "pane-log-daemon",
    "--runtime-dir",
    runtimeDir,
    "--server-identity",
    identity,
  ],
  { stdio: ["ignore", "ignore", "ignore"] },
);
const relays: ReturnType<typeof spawn>[] = [];

try {
  let hello: { pid: number } | null = null;
  for (let attempt = 0; attempt < 500 && hello == null; attempt += 1) {
    try {
      hello = await request<{ pid: number }>("hello");
    } catch {
      await sleep(10);
    }
  }
  if (hello == null) throw new Error("daemon did not start");

  for (let index = 0; index < paneCount; index += 1) {
    const logPath = path.join(logsDir, `${index}.log`);
    const endpoint = await request<{ fifoPath: string; readyPath: string }>("register", {
      paneId: `%${index + 1}`,
      logPath,
      maxBytes: 2_000_000,
      retain: 5,
    });
    const fifoFd = fsSync.openSync(endpoint.fifoPath, fsSync.constants.O_WRONLY);
    await fs.writeFile(endpoint.readyPath, "", { mode: 0o600 });
    const relay = spawn("cat", [], { stdio: ["pipe", fifoFd, "ignore"] });
    fsSync.closeSync(fifoFd);
    relays.push(relay);
    await request("activate", { logPath });
  }

  await sleep(1_000);
  const samples = [];
  for (let sample = 0; sample < 3; sample += 1) {
    const daemonRssKiB = readRssKiB(hello.pid);
    const relayRssKiB = relays.reduce((total, relay) => total + readRssKiB(relay.pid as number), 0);
    samples.push({ daemonRssKiB, relayRssKiB, totalRssKiB: daemonRssKiB + relayRssKiB });
    await sleep(500);
  }
  samples.sort((left, right) => left.totalRssKiB - right.totalRssKiB);
  console.log(JSON.stringify({ paneCount, median: samples[1], samples }, null, 2));
} finally {
  const relayExits = relays.map((relay) =>
    relay.exitCode != null || relay.signalCode != null
      ? Promise.resolve()
      : new Promise<void>((resolve) => relay.once("exit", () => resolve())),
  );
  for (const relay of relays) {
    relay.stdin?.destroy();
    relay.kill("SIGTERM");
  }
  await Promise.race([Promise.all(relayExits), sleep(500)]);
  for (const relay of relays) {
    if (relay.exitCode == null && relay.signalCode == null) relay.kill("SIGKILL");
  }
  await Promise.all(relayExits);
  await request("shutdown").catch(() => undefined);
  if (daemon.exitCode == null && daemon.signalCode == null) {
    await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
  }
  await fs.rm(tempDirectory, { recursive: true, force: true });
}
