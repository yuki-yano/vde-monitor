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
  const markerPath = path.join(dir, "server-runtime.json");
  const marker = {
    host: "127.0.0.1",
    port: 18080,
    pid: 1234,
    processStartedAt: "Tue Jul 14 02:00:00 2026",
  };
  return { markerPath, marker };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("server runtime marker", () => {
  it("writes atomically and resolves an endpoint only for the same process instance", async () => {
    const { markerPath, marker } = await createFixture();
    const runtimeMarker = createServerRuntimeMarker({ markerPath, marker });
    await runtimeMarker.write();

    await expect(
      readActiveServerRuntimeEndpoint({
        markerPath,
        readProcessStartedAt: () => marker.processStartedAt,
      }),
    ).resolves.toEqual({ host: marker.host, port: marker.port });
    expect(await fs.readdir(path.dirname(markerPath))).toEqual(["server-runtime.json"]);
  });

  it("rejects a stale process identity", async () => {
    const { markerPath, marker } = await createFixture();
    const runtimeMarker = createServerRuntimeMarker({ markerPath, marker });
    await runtimeMarker.write();

    await expect(
      readActiveServerRuntimeEndpoint({ markerPath, readProcessStartedAt: () => "new process" }),
    ).rejects.toThrow("stale");
  });

  it("allows a newer server process to atomically replace the endpoint", async () => {
    const { markerPath, marker } = await createFixture();
    const previous = createServerRuntimeMarker({ markerPath, marker });
    const nextMarker = {
      ...marker,
      port: marker.port + 1,
      pid: marker.pid + 1,
      processStartedAt: "Tue Jul 14 03:00:00 2026",
    };
    const next = createServerRuntimeMarker({ markerPath, marker: nextMarker });
    await previous.write();
    await next.write();

    await expect(
      readActiveServerRuntimeEndpoint({
        markerPath,
        readProcessStartedAt: (pid) => {
          if (pid !== nextMarker.pid) throw new Error("unexpected process");
          return nextMarker.processStartedAt;
        },
      }),
    ).resolves.toEqual({ host: nextMarker.host, port: nextMarker.port });
  });
});
