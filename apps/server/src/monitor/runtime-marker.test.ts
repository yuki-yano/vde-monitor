import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createMonitorRuntimeMarker, resolveProcessStartedAt } from "./runtime-marker";

const tempDirs: string[] = [];

const createMarkerFixture = async (pid = 1234) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vde-monitor-runtime-marker-"));
  tempDirs.push(dir);
  const markerPath = path.join(dir, "events", "cmux-test", `.runtime.${pid}.json`);
  const marker = {
    backend: "cmux" as const,
    serverKey: "cmux-test",
    pid,
    processStartedAt: `started-${pid}`,
  };
  return {
    markerPath,
    marker,
    manager: createMonitorRuntimeMarker({ markerPath, marker }),
  };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("createMonitorRuntimeMarker", () => {
  it("resolves a stable process start identity through ps", () => {
    expect(
      resolveProcessStartedAt(1234, () => ({
        stdout: " Mon Jul 13 12:00:00 2026 \n",
        status: 0,
      })),
    ).toBe("Mon Jul 13 12:00:00 2026");
  });

  it("atomically writes the runtime marker with no temporary file left behind", async () => {
    const { markerPath, marker, manager } = await createMarkerFixture();

    await manager.write();

    expect(JSON.parse(await fs.readFile(markerPath, "utf8"))).toEqual(marker);
    expect(await fs.readdir(path.dirname(markerPath))).toEqual([".runtime.1234.json"]);
    if (process.platform !== "win32") {
      const stat = await fs.stat(markerPath);
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  it("removes the marker when all ownership fields match", async () => {
    const { markerPath, manager } = await createMarkerFixture();
    await manager.write();

    await expect(manager.removeIfOwned()).resolves.toBe(true);
    await expect(fs.stat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not remove a marker owned by another pid", async () => {
    const { markerPath, marker, manager } = await createMarkerFixture();
    await manager.write();
    await fs.writeFile(markerPath, JSON.stringify({ ...marker, pid: marker.pid + 1 }));

    await expect(manager.removeIfOwned()).resolves.toBe(false);
    await expect(fs.stat(markerPath)).resolves.toBeDefined();
  });

  it("keeps another process marker when the old owner cleans up", async () => {
    const { markerPath, manager: oldManager } = await createMarkerFixture(1234);
    const newMarkerPath = path.join(path.dirname(markerPath), ".runtime.5678.json");
    const newManager = createMonitorRuntimeMarker({
      markerPath: newMarkerPath,
      marker: {
        backend: "cmux",
        serverKey: "cmux-test",
        pid: 5678,
        processStartedAt: "started-5678",
      },
    });
    await oldManager.write();

    await newManager.write();

    await expect(oldManager.removeIfOwned()).resolves.toBe(true);
    await expect(fs.stat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await fs.readFile(newMarkerPath, "utf8"))).toEqual({
      backend: "cmux",
      serverKey: "cmux-test",
      pid: 5678,
      processStartedAt: "started-5678",
    });
  });

  it("does not remove malformed or absent marker files", async () => {
    const { markerPath, manager } = await createMarkerFixture();
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, "not-json");

    await expect(manager.removeIfOwned()).resolves.toBe(false);
    await fs.unlink(markerPath);
    await expect(manager.removeIfOwned()).resolves.toBe(false);
  });
});
