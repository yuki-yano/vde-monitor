import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createJsonlTailer } from "./logs";

const tempDirs: string[] = [];
const activeTailers: ReturnType<typeof createJsonlTailer>[] = [];

const createLogPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vde-monitor-tailer-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "events.jsonl");
  await fs.writeFile(filePath, "", { mode: 0o600 });
  return filePath;
};

const createTailer = () => {
  const tailer = createJsonlTailer(5);
  activeTailers.push(tailer);
  return tailer;
};

const waitForPoll = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(async () => {
  await Promise.all(activeTailers.splice(0).map((tailer) => tailer.stop()));
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("createJsonlTailer", () => {
  it("starts at EOF and retains an incomplete appended line until its newline arrives", async () => {
    const filePath = await createLogPath();
    await fs.writeFile(filePath, "old\n");
    const onLine = vi.fn();
    const tailer = createTailer();
    tailer.onLine(onLine);
    await tailer.start(filePath);

    await fs.appendFile(filePath, "new");
    await waitForPoll();
    expect(onLine).not.toHaveBeenCalled();

    await fs.appendFile(filePath, "\n");
    await vi.waitFor(() => {
      expect(onLine).toHaveBeenCalledOnce();
      expect(onLine).toHaveBeenCalledWith("new");
    });
    await tailer.stop();
  });

  it("retains a copied partial tail after emitting a preceding line", async () => {
    const filePath = await createLogPath();
    const onLine = vi.fn();
    const tailer = createTailer();
    tailer.onLine(onLine);
    await tailer.start(filePath);

    await fs.appendFile(filePath, "first\nsec");
    await vi.waitFor(() => expect(onLine).toHaveBeenCalledWith("first"));

    await fs.appendFile(filePath, "ond\n");
    await vi.waitFor(() => {
      expect(onLine.mock.calls.map(([line]) => line)).toEqual(["first", "second"]);
    });
    await tailer.stop();
  });

  it("waits for a stable old-inode EOF before emitting replacement-inode lines", async () => {
    const filePath = await createLogPath();
    const oldWriter = await fs.open(filePath, "a");
    const onLine = vi.fn();
    const tailer = createTailer();
    tailer.onLine(onLine);
    await tailer.start(filePath);

    const rotatedPath = `${filePath}.1`;
    await fs.rename(filePath, rotatedPath);
    await fs.writeFile(filePath, "new-inode\n", { mode: 0o600 });
    // Reproduce appendFileSync opening the active path before rename, then being descheduled
    // until after the tailer has already observed the replacement inode.
    await waitForPoll();
    expect(onLine).not.toHaveBeenCalled();
    await oldWriter.appendFile("old-inode-tail\n");
    await vi.waitFor(() => {
      expect(onLine.mock.calls.map(([line]) => line)).toEqual(["old-inode-tail", "new-inode"]);
    });
    await oldWriter.close();
    await tailer.stop();
  });

  it("resets its offset and partial buffer after an in-place truncate", async () => {
    const filePath = await createLogPath();
    const onLine = vi.fn();
    const tailer = createTailer();
    tailer.onLine(onLine);
    await tailer.start(filePath);

    await fs.appendFile(filePath, "before\npartial");
    await vi.waitFor(() => expect(onLine).toHaveBeenCalledWith("before"));

    await fs.truncate(filePath, 0);
    await waitForPoll();
    await fs.appendFile(filePath, "after\n");
    await vi.waitFor(() => {
      expect(onLine.mock.calls.map(([line]) => line)).toEqual(["before", "after"]);
    });
    await tailer.stop();
  });

  it("assembles a line across multiple file reads and closes cleanly on stop", async () => {
    const filePath = await createLogPath();
    const onLine = vi.fn();
    const tailer = createTailer();
    tailer.onLine(onLine);
    await tailer.start(filePath);
    const longLine = "x".repeat(70 * 1024);

    await fs.appendFile(filePath, `${longLine}\n`);
    await vi.waitFor(() => expect(onLine).toHaveBeenCalledWith(longLine));

    await tailer.stop();
    await fs.appendFile(filePath, "ignored\n");
    await waitForPoll();
    expect(onLine).toHaveBeenCalledOnce();
  });
});
