import { createServer } from "node:net";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const builtEntrypoint = path.join(repoRoot, "dist", "index.js");
const realTmux = spawnSync("which", ["tmux"], { encoding: "utf8" }).stdout.trim();
const socketName = `vde-monitor-pane-log-${process.pid}-${Date.now()}`;
const phaseBytes = 2_100_000;
const phaseCount = 3;
const timeoutMs = 30_000;

type ClientCounters = {
  written: number;
  discarded: number;
};

type PipeState = {
  panePipe: string;
  ownerTag: string;
};

type PhaseMeasurement = {
  phase: number;
  rotations: number;
  clientWrittenDelta: number;
  clientDiscarded: number;
  panePipe: string;
  ownerTag: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const run = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; allowFailure?: boolean } = {},
) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
  });
  if (result.error != null) throw result.error;
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? "signal"}): ${result.stderr.trim()}`,
    );
  }
  return result;
};

const tmux = (args: string[], options: { cwd?: string; allowFailure?: boolean } = {}) =>
  run(realTmux, ["-L", socketName, ...args], options);

const waitFor = async <T>(description: string, probe: () => Promise<T | null>): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result != null) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`timed out waiting for ${description}${suffix}`);
};

const findFreePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address == null || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a local port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error == null ? resolve(port) : reject(error)));
    });
  });

const readClientCounters = (): ClientCounters => {
  const raw = tmux([
    "list-clients",
    "-F",
    "#{client_written}\t#{client_discarded}\t#{client_width}\t#{client_height}",
  ]).stdout.trim();
  const [writtenText, discardedText, widthText, heightText] = raw.split("\t");
  if (widthText !== "640" || heightText !== "133") {
    throw new Error(`expected a 640x133 client, received ${widthText}x${heightText}`);
  }
  const written = Number(writtenText);
  const discarded = Number(discardedText);
  if (!Number.isSafeInteger(written) || !Number.isSafeInteger(discarded)) {
    throw new Error(`invalid client counters: ${raw}`);
  }
  return { written, discarded };
};

const waitForStableClientCounters = async (): Promise<ClientCounters> => {
  let previous = readClientCounters();
  let stableSince = Date.now();
  return await waitFor("stable tmux client counters", async () => {
    await sleep(100);
    const current = readClientCounters();
    if (current.written !== previous.written || current.discarded !== previous.discarded) {
      previous = current;
      stableSince = Date.now();
      return null;
    }
    return Date.now() - stableSince >= 500 ? current : null;
  });
};

const readPipeState = (paneId: string): PipeState => {
  const raw = tmux([
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{pane_pipe}\t#{@vde-monitor_pipe}",
  ]).stdout.trim();
  const [panePipe = "", ownerTag = ""] = raw.split("\t");
  return { panePipe, ownerTag };
};

const listFilesRecursively = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
    }),
  );
  return files.flat();
};

const findCurrentLog = async (homeDirectory: string): Promise<string | null> => {
  const panesDirectory = path.join(homeDirectory, ".vde-monitor", "panes");
  const files = await listFilesRecursively(panesDirectory).catch(() => []);
  return files.find((file) => file.endsWith(".log")) ?? null;
};

const parseRotationTimestamp = (currentLog: string, filePath: string): number | null => {
  const prefix = `${currentLog}.`;
  if (!filePath.startsWith(prefix)) return null;
  const timestamp = Number(filePath.slice(prefix.length).split(".", 1)[0]);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
};

const readLogSet = async (currentLog: string) => {
  const directory = path.dirname(currentLog);
  const entries = await fs.readdir(directory);
  const rotations = entries
    .map((entry) => path.join(directory, entry))
    .map((filePath) => ({ filePath, timestamp: parseRotationTimestamp(currentLog, filePath) }))
    .filter((entry): entry is { filePath: string; timestamp: number } => entry.timestamp != null)
    .sort((left, right) => left.timestamp - right.timestamp);
  return { rotations, orderedPaths: [...rotations.map(({ filePath }) => filePath), currentLog] };
};

const totalFileBytes = async (filePaths: string[]) => {
  const stats = await Promise.all(filePaths.map((filePath) => fs.stat(filePath)));
  return stats.reduce((total, stat) => total + stat.size, 0);
};

const readAll = async (filePaths: string[]) => {
  const buffers = await Promise.all(filePaths.map((filePath) => fs.readFile(filePath)));
  return Buffer.concat(buffers);
};

const stopChild = async (child: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM") => {
  if (child == null || child.exitCode != null || child.signalCode != null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill(signal);
  await Promise.race([exited, sleep(5_000)]);
  if (child.exitCode == null && child.signalCode == null) {
    child.kill("SIGKILL");
    await Promise.race([exited, sleep(1_000)]);
  }
};

const findDaemonPids = (runtimeRoot: string): number[] =>
  run("ps", ["-axo", "pid=,command="])
    .stdout.split("\n")
    .filter((line) => line.includes("internal pane-log-daemon") && line.includes(runtimeRoot))
    .map((line) => Number(line.trim().split(/\s+/, 1)[0]))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0);

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
};

const main = async () => {
  if (realTmux.length === 0) throw new Error("tmux is not installed");
  await fs.access(builtEntrypoint);

  const tempDirectory = await fs.mkdtemp("/tmp/vpl-");
  const homeDirectory = path.join(tempDirectory, "h");
  const xdgDirectory = path.join(tempDirectory, "x");
  const binDirectory = path.join(tempDirectory, "b");
  const commandLog = path.join(tempDirectory, "tmux-commands.log");
  const expectedPath = path.join(tempDirectory, "expected.bin");
  const triggerPath = path.join(tempDirectory, "trigger");
  const visibleTriggerPath = path.join(tempDirectory, "visible-trigger");
  const generatorPath = path.join(tempDirectory, "generator.mjs");
  let monitor: ChildProcess | null = null;
  let client: ChildProcess | null = null;
  let monitorOutput = "";
  let result: Record<string, unknown> | null = null;
  let cleanupFailure: string | null = null;

  try {
    await Promise.all([
      fs.mkdir(homeDirectory, { recursive: true }),
      fs.mkdir(xdgDirectory, { recursive: true }),
      fs.mkdir(binDirectory, { recursive: true }),
      fs.writeFile(commandLog, ""),
      fs.writeFile(expectedPath, Buffer.alloc(0)),
    ]);

    const wrapperPath = path.join(binDirectory, "tmux");
    await fs.writeFile(
      wrapperPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$TMUX_COMMAND_LOG"\nexec "$REAL_TMUX" "$@"\n',
      { mode: 0o700 },
    );
    await fs.writeFile(
      generatorPath,
      `import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
const [triggerPath, expectedPath, phaseBytesText, phaseCountText] = process.argv.slice(2);
const phaseBytes = Number(phaseBytesText);
const phaseCount = Number(phaseCountText);
spawnSync("stty", ["-opost"], { stdio: ["inherit", "ignore", "inherit"] });
const expected = await fs.open(expectedPath, "a");
const writeStdout = async (buffer) => {
  if (process.stdout.write(buffer)) return;
  await new Promise((resolve, reject) => {
    process.stdout.once("drain", resolve);
    process.stdout.once("error", reject);
  });
};
let completed = 0;
while (completed < phaseCount) {
  let requested = 0;
  try { requested = Number(await fs.readFile(triggerPath, "utf8")); } catch {}
  if (requested <= completed) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    continue;
  }
  const phaseStart = completed * phaseBytes;
  let offset = 0;
  while (offset < phaseBytes) {
    const length = Math.min(65_536, phaseBytes - offset);
    const buffer = Buffer.allocUnsafe(length);
    for (let index = 0; index < length; index += 1) {
      buffer[index] = 33 + ((phaseStart + offset + index) % 90);
    }
    await expected.write(buffer);
    await writeStdout(buffer);
    offset += length;
  }
  await expected.sync();
  completed += 1;
  await fs.writeFile(triggerPath + ".done", String(completed));
}
await expected.close();
let recoveryProbeWritten = false;
while (true) {
  if (!recoveryProbeWritten) {
    try {
      await fs.access(triggerPath + ".recovery");
      await writeStdout(Buffer.from("R"));
      await fs.writeFile(triggerPath + ".recovery-done", "1");
      recoveryProbeWritten = true;
    } catch {}
  }
  if (recoveryProbeWritten) {
    try {
      await fs.access(triggerPath + ".post-repair");
      await writeStdout(Buffer.from("P"));
      await fs.writeFile(triggerPath + ".post-repair-done", "1");
      break;
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}
setInterval(() => undefined, 60_000);
`,
      { mode: 0o600 },
    );

    const visibleCommand = `while [ ! -e ${shellQuote(visibleTriggerPath)} ]; do sleep 0.01; done; ${shellQuote(process.execPath)} -e 'process.stdout.write("X".repeat(640 * 133))'; exec sleep 300`;
    tmux(["-f", "/dev/null", "-v", "new-session", "-d", "-s", "probe", visibleCommand], {
      cwd: tempDirectory,
    });
    tmux(["set-option", "-t", "probe", "status", "off"]);
    const agentCommand = `bash -c ${shellQuote(
      `exec -a codex ${shellQuote(process.execPath)} ${shellQuote(generatorPath)} ${shellQuote(triggerPath)} ${shellQuote(expectedPath)} ${phaseBytes} ${phaseCount}`,
    )}`;
    const agentPane = tmux([
      "new-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      "probe",
      "-n",
      "agent",
      agentCommand,
    ]).stdout.trim();
    const baselinePane = tmux([
      "new-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      "probe",
      "-n",
      "baseline",
      "sleep 300",
    ]).stdout.trim();
    tmux(["select-window", "-t", "probe:0"]);

    client = spawn(
      "/usr/bin/script",
      [
        "-q",
        "/dev/null",
        "/bin/zsh",
        "-lc",
        `stty cols 640 rows 133; exec ${shellQuote(realTmux)} -L ${shellQuote(socketName)} attach-session -t probe`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    client.stdout?.resume();
    client.stderr?.resume();
    await waitFor("the 640x133 tmux client", async () => {
      try {
        return readClientCounters();
      } catch {
        return null;
      }
    });
    await fs.writeFile(visibleTriggerPath, "ready");
    await waitForStableClientCounters();

    const port = await findFreePort();
    const monitorEnvironment = {
      ...process.env,
      HOME: homeDirectory,
      XDG_CONFIG_HOME: xdgDirectory,
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      REAL_TMUX: realTmux,
      TMUX_COMMAND_LOG: commandLog,
      NO_COLOR: "1",
    };
    const monitorArgs = [
      builtEntrypoint,
      "--port",
      String(port),
      "--socket-name",
      socketName,
      "--multiplexer",
      "tmux",
      "--backend",
      "terminal",
    ];
    const startMonitor = () => {
      monitorOutput = "";
      const child = spawn(process.execPath, monitorArgs, {
        cwd: repoRoot,
        env: monitorEnvironment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const captureMonitorOutput = (chunk: Buffer) => {
        monitorOutput = `${monitorOutput}${chunk.toString("utf8")}`.slice(-20_000);
      };
      child.stdout?.on("data", captureMonitorOutput);
      child.stderr?.on("data", captureMonitorOutput);
      monitor = child;
      return child;
    };
    startMonitor();

    const initialState = await waitFor("the monitor-owned pane pipe", async () => {
      if (monitor?.exitCode != null || monitor?.signalCode != null) {
        throw new Error(`monitor exited before pipe attach: ${monitorOutput}`);
      }
      const state = readPipeState(agentPane);
      return state.panePipe === "1" && state.ownerTag.startsWith("v2:") ? state : null;
    });
    const currentLog = await waitFor("the pane current log", () => findCurrentLog(homeDirectory));

    tmux(["set-option", "-p", "-t", baselinePane, "@vde-monitor_pipe", "legacy-probe"]);
    tmux(["pipe-pane", "-o", "-t", baselinePane, "exec cat >/dev/null"]);
    await sleep(200);
    const legacyDeltas: number[] = [];
    for (let cycle = 0; cycle < phaseCount; cycle += 1) {
      const before = await waitForStableClientCounters();
      tmux(["pipe-pane", "-t", baselinePane]);
      tmux(["set-option", "-pu", "-t", baselinePane, "@vde-monitor_pipe"]);
      tmux(["set-option", "-p", "-t", baselinePane, "@vde-monitor_pipe", "legacy-probe"]);
      tmux(["pipe-pane", "-o", "-t", baselinePane, "exec cat >/dev/null"]);
      const after = await waitForStableClientCounters();
      legacyDeltas.push(after.written - before.written);
      if (after.discarded !== 0)
        throw new Error(`legacy baseline discarded ${after.discarded} bytes`);
    }

    const monitorCommandLogOffset = (await fs.stat(commandLog)).size;
    const phaseMeasurements: PhaseMeasurement[] = [];
    for (let phase = 1; phase <= phaseCount; phase += 1) {
      const beforeCounters = await waitForStableClientCounters();
      await fs.writeFile(triggerPath, String(phase));
      await waitFor(`generator phase ${phase}`, async () => {
        const completed = Number(await fs.readFile(`${triggerPath}.done`, "utf8").catch(() => "0"));
        if (completed < phase) return null;
        const logSet = await readLogSet(currentLog);
        const total = await totalFileBytes(logSet.orderedPaths);
        return logSet.rotations.length >= phase && total === phaseBytes * phase ? logSet : null;
      });
      const counters = await waitForStableClientCounters();
      const state = readPipeState(agentPane);
      phaseMeasurements.push({
        phase,
        rotations: (await readLogSet(currentLog)).rotations.length,
        clientWrittenDelta: counters.written - beforeCounters.written,
        clientDiscarded: counters.discarded,
        panePipe: state.panePipe,
        ownerTag: state.ownerTag,
      });
    }

    const logSet = await readLogSet(currentLog);
    const actual = await readAll(logSet.orderedPaths);
    const expected = await fs.readFile(expectedPath);
    if (!actual.equals(expected)) {
      const mismatch = actual.findIndex((value, index) => value !== expected[index]);
      throw new Error(
        `pane log bytes differ: expected=${expected.length}, actual=${actual.length}, firstMismatch=${mismatch}`,
      );
    }
    if (phaseMeasurements.some((measurement) => measurement.clientWrittenDelta !== 0)) {
      throw new Error(`rotation caused client writes: ${JSON.stringify(phaseMeasurements)}`);
    }
    if (
      phaseMeasurements.some(
        (measurement) =>
          measurement.clientDiscarded !== 0 ||
          measurement.panePipe !== "1" ||
          measurement.ownerTag !== initialState.ownerTag,
      )
    ) {
      throw new Error(`pipe state changed during rotation: ${JSON.stringify(phaseMeasurements)}`);
    }

    const commandLogBuffer = await fs.readFile(commandLog);
    const rotationWindowCommands = commandLogBuffer.subarray(monitorCommandLogOffset).toString();
    const setOptionCount = rotationWindowCommands
      .split("\n")
      .filter((line) => line.includes("set-option")).length;
    const detachCount = rotationWindowCommands
      .split("\n")
      .filter((line) => /(?:^| )pipe-pane -t /.test(line)).length;
    if (setOptionCount !== 0 || detachCount !== 0) {
      throw new Error(
        `unexpected tmux commands during rotation: set-option=${setOptionCount}, detach=${detachCount}`,
      );
    }

    const commandLogSizeBeforeRestart = (await fs.stat(commandLog)).size;
    await stopChild(monitor, "SIGKILL");
    const stateWhileMonitorStopped = readPipeState(agentPane);
    if (
      stateWhileMonitorStopped.panePipe !== "1" ||
      stateWhileMonitorStopped.ownerTag !== initialState.ownerTag
    ) {
      throw new Error(
        `pipe did not survive monitor termination: ${JSON.stringify(stateWhileMonitorStopped)}`,
      );
    }
    startMonitor();
    await waitFor("the restarted monitor", async () => {
      if (monitor?.exitCode != null || monitor?.signalCode != null) {
        throw new Error(`restarted monitor exited: ${monitorOutput}`);
      }
      const commandLogSize = (await fs.stat(commandLog)).size;
      if (commandLogSize <= commandLogSizeBeforeRestart) return null;
      const state = readPipeState(agentPane);
      return state.panePipe === "1" && state.ownerTag === initialState.ownerTag ? state : null;
    });

    const daemonRuntimeRoot = path.join(homeDirectory, ".vde-monitor", "run", "pane-log");
    const originalDaemonPid = await waitFor(
      "the pane log daemon process",
      async () => findDaemonPids(daemonRuntimeRoot).at(0) ?? null,
    );
    process.kill(originalDaemonPid, "SIGTERM");
    await waitFor("the failed daemon process to exit", async () =>
      findDaemonPids(daemonRuntimeRoot).includes(originalDaemonPid) ? null : true,
    );
    await fs.writeFile(`${triggerPath}.recovery`, "probe");
    await waitFor("the recovery probe output", async () =>
      (await fs.readFile(`${triggerPath}.recovery-done`, "utf8").catch(() => "")) === "1"
        ? true
        : null,
    );
    const repairedDaemonPid = await waitFor("daemon failure repair", async () => {
      const daemonPids = findDaemonPids(daemonRuntimeRoot);
      const replacement = daemonPids.find((pid) => pid !== originalDaemonPid);
      const state = readPipeState(agentPane);
      if (
        replacement == null ||
        state.panePipe !== "1" ||
        state.ownerTag !== initialState.ownerTag
      ) {
        throw new Error(
          JSON.stringify({ daemonPids, state, monitorOutput: monitorOutput.slice(-2_000) }),
        );
      }
      return replacement;
    });
    await fs.writeFile(`${triggerPath}.post-repair`, "probe");
    await waitFor("post-repair pane logging", async () => {
      const completed = await fs
        .readFile(`${triggerPath}.post-repair-done`, "utf8")
        .catch(() => "");
      if (completed !== "1") return null;
      const repairedLogSet = await readLogSet(currentLog);
      const total = await totalFileBytes(repairedLogSet.orderedPaths);
      if (total !== phaseBytes * phaseCount + 1) return null;
      const current = await fs.readFile(currentLog);
      return current.at(-1) === Buffer.from("P")[0] ? true : null;
    });

    const commandLines = (await fs.readFile(commandLog, "utf8")).split("\n").filter(Boolean);
    const wrongSocketCommands = commandLines.filter(
      (line) => !line.startsWith(`-L ${socketName} `),
    );
    if (wrongSocketCommands.length !== 0) {
      throw new Error(
        `unexpected tmux commands without the dedicated socket: ${wrongSocketCommands.length}`,
      );
    }

    const writerDeltas = phaseMeasurements.map(({ clientWrittenDelta }) => clientWrittenDelta);
    const legacyAverage =
      legacyDeltas.reduce((total, value) => total + value, 0) / legacyDeltas.length;
    const writerAverage =
      writerDeltas.reduce((total, value) => total + value, 0) / writerDeltas.length;
    result = {
      socketName,
      clientGeometry: "640x133",
      rotations: logSet.rotations.length,
      expectedBytes: expected.length,
      actualBytes: actual.length,
      byteMismatch: 0,
      initialOwnerTag: initialState.ownerTag,
      monitorRestart: {
        panePipe: stateWhileMonitorStopped.panePipe,
        ownerTagUnchanged: stateWhileMonitorStopped.ownerTag === initialState.ownerTag,
      },
      daemonFailureRecovery: {
        originalDaemonPid,
        repairedDaemonPid,
        ownerTagUnchanged: readPipeState(agentPane).ownerTag === initialState.ownerTag,
      },
      phases: phaseMeasurements,
      rotationWindowTmuxCommands: {
        setOption: setOptionCount,
        detachPipePane: detachCount,
        commandsWithoutDedicatedSocket: wrongSocketCommands.length,
      },
      legacy: {
        cycles: legacyDeltas.length,
        deltas: legacyDeltas,
        total: legacyDeltas.reduce((total, value) => total + value, 0),
        maximum: Math.max(...legacyDeltas),
        median: percentile(legacyDeltas, 0.5),
        p95: percentile(legacyDeltas, 0.95),
        over80k: legacyDeltas.filter((value) => value >= 80_000).length,
      },
      writer: {
        cycles: writerDeltas.length,
        deltas: writerDeltas,
        total: writerDeltas.reduce((total, value) => total + value, 0),
        maximum: Math.max(...writerDeltas),
        median: percentile(writerDeltas, 0.5),
        p95: percentile(writerDeltas, 0.95),
        over80k: writerDeltas.filter((value) => value >= 80_000).length,
      },
      reductionPercent:
        legacyAverage === 0 ? null : ((legacyAverage - writerAverage) / legacyAverage) * 100,
    };
  } finally {
    await stopChild(monitor);
    await stopChild(client);
    tmux(["kill-server"], { allowFailure: true });
    await sleep(200);
    const serverStillRunning = tmux(["list-sessions"], { allowFailure: true }).status === 0;
    const remainingProcesses = run("ps", ["-axo", "pid=,command="], { allowFailure: true })
      .stdout.split("\n")
      .filter((line) => line.includes(tempDirectory));
    await fs.rm(tempDirectory, { recursive: true, force: true });
    if (serverStillRunning || remainingProcesses.length > 0) {
      cleanupFailure = `isolated cleanup failed: server=${serverStillRunning}, processes=${remainingProcesses.join(" | ")}`;
    }
  }

  if (cleanupFailure != null) throw new Error(cleanupFailure);
  console.log(
    JSON.stringify({ ...result, cleanup: { server: 0, processes: 0, files: 0 } }, null, 2),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
