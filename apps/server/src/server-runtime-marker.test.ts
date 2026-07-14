import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createServerRuntimeMarker,
  readActiveServerRuntimeEndpoint,
} from "./server-runtime-marker";

const tempDirs: string[] = [];

const createFixture = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vde-monitor-server-runtime-"));
  tempDirs.push(dir);
  const markerDirectory = path.join(dir, "server-runtimes");
  const processStartedAtByPid = new Map<number, string>();
  const runningPids = new Set<number>();
  const readProcessStartedAt = (pid: number) => {
    const startedAt = processStartedAtByPid.get(pid);
    if (startedAt == null) throw new Error("process not found");
    return startedAt;
  };
  const isProcessRunning = (pid: number) => runningPids.has(pid);
  const createMarker = ({
    pid,
    instanceId,
    processStartedAt = `started-${pid}`,
  }: {
    pid: number;
    instanceId: string;
    processStartedAt?: string;
  }) => {
    processStartedAtByPid.set(pid, processStartedAt);
    runningPids.add(pid);
    return createServerRuntimeMarker({
      pid,
      instanceId,
      processStartedAt,
      markerDirectory,
      readProcessStartedAt,
      isProcessRunning,
    });
  };
  return {
    createMarker,
    isProcessRunning,
    markerDirectory,
    processStartedAtByPid,
    readProcessStartedAt,
    runningPids,
  };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("server runtime marker", () => {
  it("claims, publishes, and resolves the only verified server endpoint", async () => {
    const fixture = await createFixture();
    const runtimeMarker = fixture.createMarker({ pid: 1234, instanceId: "a1" });

    await runtimeMarker.claim();
    await expect(
      readActiveServerRuntimeEndpoint({
        markerDirectory: fixture.markerDirectory,
        readProcessStartedAt: fixture.readProcessStartedAt,
        isProcessRunning: fixture.isProcessRunning,
      }),
    ).rejects.toThrow("still starting");

    await runtimeMarker.publish({ host: "127.0.0.1", port: 18080 });

    await expect(
      readActiveServerRuntimeEndpoint({
        markerDirectory: fixture.markerDirectory,
        readProcessStartedAt: fixture.readProcessStartedAt,
        isProcessRunning: fixture.isProcessRunning,
      }),
    ).resolves.toEqual({ host: "127.0.0.1", port: 18080 });
    expect(await fs.readdir(fixture.markerDirectory)).toEqual(["server-runtime.1234.a1.json"]);
  });

  it("never allows two concurrent claims to succeed", async () => {
    const fixture = await createFixture();
    const first = fixture.createMarker({ pid: 1234, instanceId: "a1" });
    const second = fixture.createMarker({ pid: 5678, instanceId: "b2" });

    const results = await Promise.allSettled([first.claim(), second.claim()]);

    const fulfilledCount = results.filter((result) => result.status === "fulfilled").length;
    expect(fulfilledCount).toBeLessThanOrEqual(1);
    expect(results.filter((result) => result.status === "rejected").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(await fs.readdir(fixture.markerDirectory)).toHaveLength(fulfilledCount);
  });

  it("rejects a later claim while another server process is active", async () => {
    const fixture = await createFixture();
    const first = fixture.createMarker({ pid: 1234, instanceId: "a1" });
    const second = fixture.createMarker({ pid: 5678, instanceId: "b2" });
    await first.claim();

    await expect(second.claim()).rejects.toThrow("another vde-monitor server is already running");

    expect(await fs.readdir(fixture.markerDirectory)).toEqual(["server-runtime.1234.a1.json"]);
  });

  it("removes a dead claim and permits a new server", async () => {
    const fixture = await createFixture();
    const previous = fixture.createMarker({ pid: 1234, instanceId: "a1" });
    await previous.claim();
    fixture.runningPids.delete(1234);

    const next = fixture.createMarker({ pid: 5678, instanceId: "b2" });
    await next.claim();
    await next.publish({ host: "127.0.0.1", port: 18081 });

    expect(await fs.readdir(fixture.markerDirectory)).toEqual(["server-runtime.5678.b2.json"]);
  });

  it("rejects a reused pid by comparing the process start identity", async () => {
    const fixture = await createFixture();
    const previous = fixture.createMarker({
      pid: 1234,
      instanceId: "a1",
      processStartedAt: "old-process",
    });
    await previous.claim();
    fixture.processStartedAtByPid.set(1234, "reused-process");

    const next = fixture.createMarker({ pid: 5678, instanceId: "b2" });
    await next.claim();

    expect(await fs.readdir(fixture.markerDirectory)).toEqual(["server-runtime.5678.b2.json"]);
  });

  it("fails closed when a live claim process identity cannot be inspected", async () => {
    const fixture = await createFixture();
    const active = fixture.createMarker({ pid: 1234, instanceId: "a1" });
    await active.claim();
    const next = createServerRuntimeMarker({
      pid: 5678,
      instanceId: "b2",
      processStartedAt: "started-5678",
      markerDirectory: fixture.markerDirectory,
      isProcessRunning: () => true,
      readProcessStartedAt: () => {
        throw new Error("inspection failed");
      },
    });

    await expect(next.claim()).rejects.toThrow("another vde-monitor server is already running");
    expect(await fs.readdir(fixture.markerDirectory)).toEqual(["server-runtime.1234.a1.json"]);
  });

  it("removes only its own claim", async () => {
    const fixture = await createFixture();
    const runtimeMarker = fixture.createMarker({ pid: 1234, instanceId: "a1" });
    await runtimeMarker.claim();

    await expect(runtimeMarker.removeIfOwned()).resolves.toBe(true);
    await expect(runtimeMarker.removeIfOwned()).resolves.toBe(false);
    expect(await fs.readdir(fixture.markerDirectory)).toEqual([]);
  });
});
