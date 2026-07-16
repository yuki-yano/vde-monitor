import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sampleIntervalMs = 500;
const progressIntervalMs = 5 * 60_000;
const redrawBurstBytes = 80_000;

type ClientCounters = {
  written: number;
  discarded: number;
};

type PaneState = {
  panePipe: string;
  ownerTag: string;
};

const parseDuration = () => {
  const durationIndex = process.argv.indexOf("--duration-ms");
  const text = durationIndex < 0 ? String(30 * 60_000) : process.argv[durationIndex + 1];
  const duration = Number(text);
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new Error(`--duration-ms must be a positive safe integer: ${text ?? "missing"}`);
  }
  return duration;
};

const runTmux = (args: string[]) => {
  const result = spawnSync("tmux", args, { encoding: "utf8" });
  if (result.error != null) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tmux ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

const readClients = (): Map<string, ClientCounters> => {
  const rows = runTmux([
    "list-clients",
    "-F",
    "#{client_name}\t#{client_written}\t#{client_discarded}",
  ])
    .trim()
    .split("\n")
    .filter(Boolean);
  return new Map(
    rows.map((row) => {
      const [name = "", writtenText = "", discardedText = ""] = row.split("\t");
      const written = Number(writtenText);
      const discarded = Number(discardedText);
      if (!Number.isSafeInteger(written) || !Number.isSafeInteger(discarded)) {
        throw new Error(`invalid tmux client counters: ${row}`);
      }
      return [name, { written, discarded }];
    }),
  );
};

const readPanes = (): Map<string, PaneState> => {
  const rows = runTmux(["list-panes", "-a", "-F", "#{pane_id}\t#{pane_pipe}\t#{@vde-monitor_pipe}"])
    .trim()
    .split("\n")
    .filter(Boolean);
  return new Map(
    rows.map((row) => {
      const [paneId = "", panePipe = "", ownerTag = ""] = row.split("\t");
      return [paneId, { panePipe, ownerTag }];
    }),
  );
};

const listRotationNames = async (directory: string): Promise<Set<string>> => {
  const names = await fs.readdir(directory);
  return new Set(names.filter((name) => /^.+\.log\.\d+\.[^.]+$/.test(name)));
};

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const main = async () => {
  const durationMs = parseDuration();
  const paneLogDirectory = path.join(os.homedir(), ".vde-monitor", "panes", "default");
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;
  let nextProgressAt = startedAt + progressIntervalMs;
  let previousClients = readClients();
  let previousPanes = readPanes();
  let knownRotations = await listRotationNames(paneLogDirectory);
  const rotationEvents: Array<{
    name: string;
    observedAt: string;
    maxClientWrittenDelta: number;
    clients: Record<string, { writtenDelta: number; discarded: number }>;
    ownedPipeCount: number;
    disconnectedOwnedPipeCount: number;
  }> = [];
  const ownerTagMutations: Array<{ paneId: string; before: string; after: string }> = [];
  const ownedPipeDisconnects = new Set<string>();
  const allSampleDeltas: number[] = [];
  const rotationSampleDeltas: number[] = [];
  const nonRotationSampleDeltas: number[] = [];
  let maximumClientDiscarded = 0;
  let samples = 0;

  while (Date.now() < deadline) {
    await sleep(Math.min(sampleIntervalMs, Math.max(1, deadline - Date.now())));
    const clients = readClients();
    const panes = readPanes();
    const rotations = await listRotationNames(paneLogDirectory);
    samples += 1;

    for (const [paneId, state] of panes) {
      const previous = previousPanes.get(paneId);
      if (
        previous != null &&
        previous.ownerTag.length > 0 &&
        state.ownerTag.length > 0 &&
        previous.ownerTag !== state.ownerTag
      ) {
        ownerTagMutations.push({ paneId, before: previous.ownerTag, after: state.ownerTag });
      }
      if (state.ownerTag.length > 0 && state.panePipe !== "1") {
        ownedPipeDisconnects.add(paneId);
      }
    }
    for (const counters of clients.values()) {
      maximumClientDiscarded = Math.max(maximumClientDiscarded, counters.discarded);
    }

    const newRotations = [...rotations].filter((name) => !knownRotations.has(name));
    const sampleMaximumClientWrittenDelta = Math.max(
      0,
      ...[...clients].map(([clientName, counters]) =>
        Math.max(
          0,
          counters.written - (previousClients.get(clientName)?.written ?? counters.written),
        ),
      ),
    );
    allSampleDeltas.push(sampleMaximumClientWrittenDelta);
    (newRotations.length > 0 ? rotationSampleDeltas : nonRotationSampleDeltas).push(
      sampleMaximumClientWrittenDelta,
    );
    for (const name of newRotations) {
      const clientDeltas = Object.fromEntries(
        [...clients].map(([clientName, counters]) => [
          clientName,
          {
            writtenDelta: Math.max(
              0,
              counters.written - (previousClients.get(clientName)?.written ?? counters.written),
            ),
            discarded: counters.discarded,
          },
        ]),
      );
      const ownedPipes = [...panes.values()].filter((state) => state.ownerTag.length > 0);
      rotationEvents.push({
        name,
        observedAt: new Date().toISOString(),
        maxClientWrittenDelta: Math.max(
          0,
          ...Object.values(clientDeltas).map(({ writtenDelta }) => writtenDelta),
        ),
        clients: clientDeltas,
        ownedPipeCount: ownedPipes.length,
        disconnectedOwnedPipeCount: ownedPipes.filter(({ panePipe }) => panePipe !== "1").length,
      });
    }

    previousClients = clients;
    previousPanes = panes;
    knownRotations = rotations;
    if (Date.now() >= nextProgressAt) {
      console.log(
        JSON.stringify({
          progressMinutes: Math.round((Date.now() - startedAt) / 60_000),
          rotations: rotationEvents.length,
          maximumClientDiscarded,
          ownerTagMutations: ownerTagMutations.length,
          ownedPipeDisconnects: ownedPipeDisconnects.size,
        }),
      );
      nextProgressAt += progressIntervalMs;
    }
  }

  const deltas = rotationEvents.map(({ maxClientWrittenDelta }) => maxClientWrittenDelta);
  const summarize = (values: number[]) => ({
    samples: values.length,
    total: values.reduce((total, value) => total + value, 0),
    maximum: Math.max(0, ...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    over80k: values.filter((value) => value >= redrawBurstBytes).length,
  });
  console.log(
    JSON.stringify(
      {
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs,
        sampleIntervalMs,
        samples,
        clientNames: [...previousClients.keys()],
        rotationCount: rotationEvents.length,
        rotationClientWritten: {
          ...summarize(deltas),
        },
        sampleClientWritten: {
          all: summarize(allSampleDeltas),
          rotation: summarize(rotationSampleDeltas),
          nonRotation: summarize(nonRotationSampleDeltas),
        },
        maximumClientDiscarded,
        ownerTagMutations,
        ownedPipeDisconnects: [...ownedPipeDisconnects],
        rotationEvents,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
