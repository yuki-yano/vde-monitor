import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";

import type { Readable, Writable } from "node:stream";

type PaneLogWriterDeps = {
  stat: typeof fs.stat;
  openWriter: (filePath: string) => Promise<Writable>;
  rename: typeof fs.rename;
  readdir: (dirPath: string) => Promise<string[]>;
  unlink: typeof fs.unlink;
  now: () => number;
  randomId: () => string;
};

type RunPaneLogWriterOptions = {
  input: Readable;
  logPath: string;
  maxBytes: number;
  retain: number;
  onReady?: () => void;
  deps?: Partial<PaneLogWriterDeps>;
};

type RotationEntry = {
  fullPath: string;
  timestamp: number;
};

const openWriter = async (filePath: string): Promise<Writable> => {
  const handle = await fs.open(filePath, "a", 0o600);
  try {
    return handle.createWriteStream({ autoClose: true });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
};

const defaultDeps: PaneLogWriterDeps = {
  stat: fs.stat,
  openWriter,
  rename: fs.rename,
  readdir: (dirPath) => fs.readdir(dirPath),
  unlink: fs.unlink,
  now: Date.now,
  randomId: randomUUID,
};

const resolveDeps = (overrides?: Partial<PaneLogWriterDeps>): PaneLogWriterDeps => ({
  ...defaultDeps,
  ...overrides,
});

const validatePositiveSafeInteger = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
};

const parseRotationEntry = (
  dirPath: string,
  baseName: string,
  fileName: string,
): RotationEntry | null => {
  const prefix = `${baseName}.`;
  if (!fileName.startsWith(prefix)) {
    return null;
  }
  const suffix = fileName.slice(prefix.length);
  const separatorIndex = suffix.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === suffix.length - 1) {
    return null;
  }
  const timestampText = suffix.slice(0, separatorIndex);
  if (!/^\d+$/.test(timestampText)) {
    return null;
  }
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    return null;
  }
  return { fullPath: path.join(dirPath, fileName), timestamp };
};

const writeBuffer = async (writer: Writable, buffer: Buffer): Promise<void> => {
  if (buffer.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    let callbackDone = false;
    let drainDone = true;
    let settled = false;

    const cleanup = () => {
      writer.off("error", onError);
      writer.off("drain", onDrain);
    };
    const settleError = (error: unknown, keepErrorListener = false) => {
      if (settled) return;
      settled = true;
      writer.off("drain", onDrain);
      if (!keepErrorListener) {
        writer.off("error", onError);
      }
      reject(error);
    };
    const settleSuccess = () => {
      if (settled || !callbackDone || !drainDone) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      if (settled) {
        cleanup();
        return;
      }
      settleError(error);
    };
    const onDrain = () => {
      drainDone = true;
      settleSuccess();
    };

    writer.once("error", onError);
    const accepted = writer.write(buffer, (error) => {
      if (error != null) {
        // Node emits the stream error after invoking the write callback. Keep the listener until
        // that event arrives so a rejected write never becomes an uncaught process error.
        settleError(error, true);
        return;
      }
      callbackDone = true;
      settleSuccess();
    });
    if (!accepted) {
      drainDone = false;
      writer.once("drain", onDrain);
    }
  });
};

const closeWriter = async (writer: Writable): Promise<void> => {
  if (writer.writableFinished || writer.closed || writer.destroyed) return;
  const completion = finished(writer, { cleanup: true });
  writer.end();
  await completion;
};

const destroyWriter = async (writer: Writable): Promise<void> => {
  if (writer.destroyed) return;
  const completion = finished(writer, { cleanup: true }).catch(() => undefined);
  writer.destroy();
  await completion;
};

export const runPaneLogWriter = async ({
  input,
  logPath,
  maxBytes,
  retain,
  onReady,
  deps: depOverrides,
}: RunPaneLogWriterOptions): Promise<void> => {
  if (!path.isAbsolute(logPath)) {
    throw new Error("pane log path must be absolute");
  }
  validatePositiveSafeInteger(maxBytes, "maxBytes");
  validatePositiveSafeInteger(retain, "retain");

  const deps = resolveDeps(depOverrides);
  const dirPath = path.dirname(logPath);
  const baseName = path.basename(logPath);
  let writer: Writable | null = null;
  let currentSize = 0;
  let previousRotationTimestamp = -1;

  const listRotations = async (): Promise<RotationEntry[]> => {
    const fileNames = await deps.readdir(dirPath);
    return fileNames
      .map((fileName) => parseRotationEntry(dirPath, baseName, fileName))
      .filter((entry): entry is RotationEntry => entry != null)
      .sort((left, right) =>
        left.timestamp === right.timestamp
          ? left.fullPath.localeCompare(right.fullPath)
          : left.timestamp - right.timestamp,
      );
  };

  const openCurrentWriter = async () => {
    writer = await deps.openWriter(logPath);
  };

  const rotate = async ({ resumeInput = true }: { resumeInput?: boolean } = {}) => {
    input.pause();
    if (writer != null) {
      const closingWriter = writer;
      writer = null;
      await closeWriter(closingWriter);
    }

    const existingRotations = await listRotations();
    const latestExistingTimestamp = existingRotations.at(-1)?.timestamp ?? -1;
    const minimumTimestamp = Math.max(latestExistingTimestamp, previousRotationTimestamp) + 1;
    const timestamp = Math.max(deps.now(), minimumTimestamp);
    if (!Number.isSafeInteger(timestamp)) {
      throw new Error("pane log rotation timestamp exceeds the safe integer range");
    }
    const rotatedPath = path.join(dirPath, `${baseName}.${timestamp}.${deps.randomId()}`);
    await deps.rename(logPath, rotatedPath);
    previousRotationTimestamp = timestamp;

    try {
      await openCurrentWriter();
      const rotations = await listRotations();
      const deleteCount = Math.max(0, rotations.length - retain);
      for (const entry of rotations.slice(0, deleteCount)) {
        await deps.unlink(entry.fullPath);
      }
    } catch (error) {
      const openedWriter = writer;
      writer = null;
      if (openedWriter != null) {
        await closeWriter(openedWriter).catch(() => undefined);
      }
      throw error;
    }

    currentSize = 0;
    if (resumeInput) input.resume();
  };

  input.pause();
  try {
    const initialStat = await deps.stat(logPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    currentSize = initialStat?.size ?? 0;
    if (currentSize > maxBytes) {
      await rotate({ resumeInput: false });
    } else {
      await openCurrentWriter();
    }
    onReady?.();

    for await (const chunk of input) {
      if (!Buffer.isBuffer(chunk)) {
        throw new Error("pane log input must yield Buffer chunks");
      }
      let offset = 0;
      while (offset < chunk.length) {
        if (currentSize === maxBytes) {
          await rotate();
        }
        const writableBytes = Math.min(maxBytes - currentSize, chunk.length - offset);
        const section = chunk.subarray(offset, offset + writableBytes);
        if (writer == null) {
          throw new Error("pane log writer is not open");
        }
        await writeBuffer(writer, section);
        currentSize += writableBytes;
        offset += writableBytes;
      }
    }

    if (writer != null) {
      const closingWriter = writer;
      writer = null;
      await closeWriter(closingWriter);
    }
  } catch (error) {
    input.pause();
    const openedWriter = writer;
    writer = null;
    if (openedWriter != null) {
      await destroyWriter(openedWriter);
    }
    throw error;
  }
};

export const runPaneLogWriterCommand = async ({
  logPath,
  maxBytes,
  retain,
  input = process.stdin,
}: {
  logPath: string;
  maxBytes: number;
  retain: number;
  input?: Readable;
}) => {
  await runPaneLogWriter({ input, logPath, maxBytes, retain });
};
