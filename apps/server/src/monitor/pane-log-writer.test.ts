import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runPaneLogWriter } from "./pane-log-writer";

const tempDirs: string[] = [];

const createLogPath = async (initial: Buffer | string = Buffer.alloc(0)) => {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "vde-pane-writer-"));
  tempDirs.push(dirPath);
  const logPath = path.join(dirPath, "pane.log");
  await fs.writeFile(logPath, initial, { mode: 0o600 });
  return logPath;
};

const listLogParts = async (logPath: string) => {
  const dirPath = path.dirname(logPath);
  const baseName = path.basename(logPath);
  const rotations = (await fs.readdir(dirPath))
    .filter((name) => name.startsWith(`${baseName}.`))
    .sort((left, right) => Number(left.split(".").at(-2)) - Number(right.split(".").at(-2)));
  return [...rotations.map((name) => path.join(dirPath, name)), logPath];
};

const readCombinedLogs = async (logPath: string) => {
  const parts = await listLogParts(logPath);
  return Buffer.concat(await Promise.all(parts.map((part) => fs.readFile(part))));
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runPaneLogWriter", () => {
  it("appends ordered chunks to one file below the threshold", async () => {
    const logPath = await createLogPath("old-");

    await runPaneLogWriter({
      input: Readable.from([Buffer.from("one-"), Buffer.from("two")]),
      logPath,
      maxBytes: 100,
      retain: 5,
    });

    expect(await fs.readFile(logPath, "utf8")).toBe("old-one-two");
    expect(await listLogParts(logPath)).toEqual([logPath]);
  });

  it("splits one chunk across multiple rotations without losing bytes", async () => {
    const logPath = await createLogPath();
    const input = Buffer.from("abcdefghijklmnop");
    let randomId = 0;

    await runPaneLogWriter({
      input: Readable.from([input]),
      logPath,
      maxBytes: 4,
      retain: 5,
      deps: { now: () => 100, randomId: () => `id-${randomId++}` },
    });

    const parts = await listLogParts(logPath);
    expect(parts).toHaveLength(4);
    expect(await Promise.all(parts.map((part) => fs.stat(part).then((stat) => stat.size)))).toEqual(
      [4, 4, 4, 4],
    );
    expect(await readCombinedLogs(logPath)).toEqual(input);
  });

  it("rotates an oversized existing log before reading stdin", async () => {
    const initial = Buffer.from("oversized");
    const appended = Buffer.from("new");
    const logPath = await createLogPath(initial);
    const events: string[] = [];
    const input = new Readable({
      read() {
        events.push("read");
        this.push(appended);
        this.push(null);
      },
    });

    await runPaneLogWriter({
      input,
      logPath,
      maxBytes: 4,
      retain: 5,
      deps: {
        rename: async (source, destination) => {
          events.push("rename");
          await fs.rename(source, destination);
        },
      },
    });

    expect(await readCombinedLogs(logPath)).toEqual(Buffer.concat([initial, appended]));
    expect(await fs.readFile(logPath)).toEqual(appended);
    expect(events).toEqual(["rename", "read"]);
  });

  it("creates a missing current log with owner-only permissions", async () => {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "vde-pane-writer-"));
    tempDirs.push(dirPath);
    const logPath = path.join(dirPath, "pane.log");

    await runPaneLogWriter({
      input: Readable.from([Buffer.from("secure")]),
      logPath,
      maxBytes: 100,
      retain: 5,
    });

    expect((await fs.stat(logPath)).mode & 0o777).toBe(0o600);
  });

  it("rotates a full existing log before writing the next byte", async () => {
    const initial = Buffer.from("full");
    const logPath = await createLogPath(initial);

    await runPaneLogWriter({
      input: Readable.from([Buffer.from("x")]),
      logPath,
      maxBytes: initial.length,
      retain: 5,
    });

    expect(await readCombinedLogs(logPath)).toEqual(Buffer.from("fullx"));
    expect(await fs.readFile(logPath, "utf8")).toBe("x");
  });

  it("retains the newest five rotations and preserves the retained input suffix", async () => {
    const logPath = await createLogPath();
    const input = Buffer.from("abcdefghijklmnopqrstuvwx");

    await runPaneLogWriter({
      input: Readable.from([input]),
      logPath,
      maxBytes: 3,
      retain: 5,
      deps: { now: () => 100 },
    });

    const parts = await listLogParts(logPath);
    expect(parts).toHaveLength(6);
    const combined = await readCombinedLogs(logPath);
    expect(combined).toEqual(input.subarray(input.length - combined.length));
    expect(combined.toString()).toBe("ghijklmnopqrstuvwx");
  });

  it("uses monotonically increasing timestamps when the clock does not advance", async () => {
    const logPath = await createLogPath();

    await runPaneLogWriter({
      input: Readable.from([Buffer.from("abcdefghijkl")]),
      logPath,
      maxBytes: 3,
      retain: 5,
      deps: { now: () => 100 },
    });

    const timestamps = (await listLogParts(logPath))
      .slice(0, -1)
      .map((part) => Number(path.basename(part).split(".").at(-2)));
    expect(timestamps).toEqual([100, 101, 102]);
  });

  it("waits for backpressure and preserves every byte", async () => {
    const writes: Buffer[] = [];
    const writer = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        setTimeout(() => {
          writes.push(Buffer.from(chunk));
          callback();
        }, 1);
      },
    });

    await runPaneLogWriter({
      input: Readable.from([Buffer.from("ab"), Buffer.from("cd"), Buffer.from("ef")]),
      logPath: "/virtual/pane.log",
      maxBytes: 100,
      retain: 5,
      deps: {
        stat: vi.fn(async () => {
          const error = Object.assign(new Error("missing"), { code: "ENOENT" });
          throw error;
        }) as never,
        openWriter: vi.fn(async () => writer),
      },
    });

    expect(Buffer.concat(writes).toString()).toBe("abcdef");
  });

  it("preserves arbitrary bytes split across UTF-8 boundaries", async () => {
    const logPath = await createLogPath();
    const chunks = [Buffer.from([0xe2]), Buffer.from([0x82, 0xac, 0xff, 0x00])];

    await runPaneLogWriter({
      input: Readable.from(chunks),
      logPath,
      maxBytes: 100,
      retain: 5,
    });

    expect(await fs.readFile(logPath)).toEqual(Buffer.concat(chunks));
  });

  it("closes the writer after stdin EOF", async () => {
    const final = vi.fn((callback: (error?: Error | null) => void) => callback());
    const writer = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
      final,
    });

    await runPaneLogWriter({
      input: Readable.from([Buffer.from("done")]),
      logPath: "/virtual/pane.log",
      maxBytes: 100,
      retain: 5,
      deps: {
        stat: vi.fn(async () => {
          const error = Object.assign(new Error("missing"), { code: "ENOENT" });
          throw error;
        }) as never,
        openWriter: vi.fn(async () => writer),
      },
    });

    expect(final).toHaveBeenCalledOnce();
    expect(writer.writableEnded).toBe(true);
  });

  it("rejects write failures", async () => {
    const writer = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("write failed"));
      },
    });

    await expect(
      runPaneLogWriter({
        input: Readable.from([Buffer.from("data")]),
        logPath: "/virtual/pane.log",
        maxBytes: 100,
        retain: 5,
        deps: {
          stat: vi.fn(async () => {
            const error = Object.assign(new Error("missing"), { code: "ENOENT" });
            throw error;
          }) as never,
          openWriter: vi.fn(async () => writer),
        },
      }),
    ).rejects.toThrow("write failed");
  });

  it("rejects close failures", async () => {
    const writer = new Writable({
      final(callback) {
        callback(new Error("close failed"));
      },
    });

    await expect(
      runPaneLogWriter({
        input: Readable.from([]),
        logPath: "/virtual/pane.log",
        maxBytes: 100,
        retain: 5,
        deps: {
          stat: vi.fn(async () => {
            const error = Object.assign(new Error("missing"), { code: "ENOENT" });
            throw error;
          }) as never,
          openWriter: vi.fn(async () => writer),
        },
      }),
    ).rejects.toThrow("close failed");
  });

  it("rejects rename failures", async () => {
    const logPath = await createLogPath("oversized");

    await expect(
      runPaneLogWriter({
        input: Readable.from([]),
        logPath,
        maxBytes: 1,
        retain: 5,
        deps: { rename: vi.fn(async () => Promise.reject(new Error("rename failed"))) },
      }),
    ).rejects.toThrow("rename failed");
  });

  it("rejects open failures", async () => {
    const logPath = await createLogPath("oversized");

    await expect(
      runPaneLogWriter({
        input: Readable.from([]),
        logPath,
        maxBytes: 1,
        retain: 5,
        deps: { openWriter: vi.fn(async () => Promise.reject(new Error("open failed"))) },
      }),
    ).rejects.toThrow("open failed");
  });

  it("rejects readdir failures", async () => {
    const logPath = await createLogPath("oversized");

    await expect(
      runPaneLogWriter({
        input: Readable.from([]),
        logPath,
        maxBytes: 1,
        retain: 5,
        deps: { readdir: vi.fn(async () => Promise.reject(new Error("readdir failed"))) },
      }),
    ).rejects.toThrow("readdir failed");
  });

  it("rejects unlink failures", async () => {
    const logPath = await createLogPath("oversized");
    const dirPath = path.dirname(logPath);
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        fs.writeFile(path.join(dirPath, `pane.log.${index}.id-${index}`), "old"),
      ),
    );

    await expect(
      runPaneLogWriter({
        input: Readable.from([]),
        logPath,
        maxBytes: 1,
        retain: 5,
        deps: { unlink: vi.fn(async () => Promise.reject(new Error("unlink failed"))) },
      }),
    ).rejects.toThrow("unlink failed");
  });
});
