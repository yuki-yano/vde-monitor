import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { FileHandle } from "node:fs/promises";

export const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
};

export const rotateLogIfNeeded = async (
  filePath: string,
  maxBytes: number,
  retainRotations: number,
  hooks: {
    beforeRotate?: () => Promise<boolean | void>;
    afterRotate?: () => Promise<void>;
  } = {},
): Promise<boolean> => {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size <= maxBytes) {
    return false;
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const rotatedPath = path.join(dir, `${base}.${Date.now()}.${randomUUID()}`);
  let runAfterRotate = false;
  try {
    if ((await hooks.beforeRotate?.()) === false) {
      return false;
    }
    runAfterRotate = true;
    try {
      await fs.rename(filePath, rotatedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
    await fs.open(filePath, "a", 0o600).then((handle) => handle.close());

    const files = await fs.readdir(dir);
    const rotations = files
      .filter((name) => name.startsWith(`${base}.`))
      .map((name) => ({ name, fullPath: path.join(dir, name) }));
    if (rotations.length > retainRotations) {
      const sorted = rotations.sort((a, b) => a.name.localeCompare(b.name));
      const toDelete = sorted.slice(0, rotations.length - retainRotations);
      await Promise.all(toDelete.map((entry) => fs.unlink(entry.fullPath).catch(() => null)));
    }
    return true;
  } finally {
    if (runAfterRotate) {
      await hooks.afterRotate?.();
    }
  }
};

export const createLogActivityPoller = (pollIntervalMs: number) => {
  const entries = new Map<string, { paneId: string; size: number; initialized: boolean }>();
  const listeners = new Set<(paneId: string, at: string) => void>();
  let timer: NodeJS.Timeout | null = null;
  let pollRunning = false;

  const register = (paneId: string, filePath: string) => {
    Array.from(entries.entries()).forEach(([entryPath, entry]) => {
      if (entryPath !== filePath && entry.paneId === paneId) {
        entries.delete(entryPath);
      }
    });
    const existing = entries.get(filePath);
    if (existing) {
      existing.paneId = paneId;
      return;
    }
    entries.set(filePath, { paneId, size: 0, initialized: false });
  };

  const unregister = (paneId: string) => {
    Array.from(entries.entries()).forEach(([filePath, entry]) => {
      if (entry.paneId === paneId) {
        entries.delete(filePath);
      }
    });
  };

  const onActivity = (listener: (paneId: string, at: string) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const start = () => {
    if (timer) {
      return;
    }
    const poll = async () => {
      if (pollRunning) {
        return;
      }
      pollRunning = true;
      try {
        await Promise.all(
          Array.from(entries.entries()).map(async ([filePath, entry]) => {
            const stat = await fs.stat(filePath).catch(() => null);
            if (!stat) {
              return;
            }
            if (!entry.initialized) {
              entry.size = stat.size;
              entry.initialized = true;
              return;
            }
            if (stat.size < entry.size) {
              entry.size = stat.size;
              return;
            }
            if (stat.size > entry.size) {
              entry.size = stat.size;
              const at = new Date().toISOString();
              listeners.forEach((listener) => listener(entry.paneId, at));
            }
          }),
        );
      } finally {
        pollRunning = false;
      }
    };
    timer = setInterval(() => {
      void poll().catch(() => null);
    }, pollIntervalMs);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { register, unregister, onActivity, start, stop };
};

export const createJsonlTailer = (pollIntervalMs: number) => {
  const READ_BUFFER_SIZE = 64 * 1024;
  // A hook process can open the old inode before rename and finish its synchronous append later.
  // Keep replaced inodes long enough to observe a stable EOF, but cap the lifetime so a wedged
  // writer cannot retain descriptors forever.
  const RETIRED_MIN_GRACE_MS = Math.max(250, pollIntervalMs * 2);
  const RETIRED_MAX_GRACE_MS = Math.max(2_000, pollIntervalMs * 10);
  const RETIRED_STABLE_EOF_POLLS = 2;
  type ReadState = {
    handle: FileHandle;
    identity: string | null;
    offset: number;
    buffer: Buffer;
    retiredAt: number | null;
    stableEofPolls: number;
  };
  let readStates: ReadState[] = [];
  let timer: NodeJS.Timeout | null = null;
  let pollPromise: Promise<void> | null = null;
  let stopping = false;
  const listeners = new Set<(line: string) => void>();

  const onLine = (listener: (line: string) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const resolveFileIdentity = (stat: { dev?: unknown; ino?: unknown }) =>
    typeof stat.dev === "number" && typeof stat.ino === "number" ? `${stat.dev}:${stat.ino}` : null;

  const resetReadState = (state: ReadState, identity: string | null) => {
    state.offset = 0;
    state.buffer = Buffer.alloc(0);
    state.identity = identity;
  };

  const emitCompleteLines = (state: ReadState, chunk: Buffer) => {
    state.buffer = state.buffer.length === 0 ? chunk : Buffer.concat([state.buffer, chunk]);
    let newlineIndex = state.buffer.indexOf(0x0a);
    let consumedLine = false;
    while (newlineIndex >= 0) {
      const line = state.buffer.subarray(0, newlineIndex).toString("utf8");
      state.buffer = state.buffer.subarray(newlineIndex + 1);
      consumedLine = true;
      if (line.trim().length > 0) {
        listeners.forEach((listener) => listener(line));
      }
      newlineIndex = state.buffer.indexOf(0x0a);
    }
    if (consumedLine) {
      // Buffer.subarray keeps its parent allocation alive. Copy the incomplete tail so a
      // short partial line does not retain the entire read buffer between polls.
      state.buffer = Buffer.from(state.buffer);
    }
  };

  const drainState = async (state: ReadState): Promise<number> => {
    const openedStat = await state.handle.stat();
    if (openedStat.size < state.offset) {
      resetReadState(state, resolveFileIdentity(openedStat));
    } else if (state.identity == null) {
      state.identity = resolveFileIdentity(openedStat);
    }

    const allocated = Buffer.alloc(READ_BUFFER_SIZE);
    let totalBytesRead = 0;
    while (true) {
      const { bytesRead } = await state.handle.read(allocated, 0, allocated.length, state.offset);
      if (bytesRead === 0) {
        return totalBytesRead;
      }
      state.offset += bytesRead;
      totalBytesRead += bytesRead;
      emitCompleteLines(state, Buffer.from(allocated.subarray(0, bytesRead)));
    }
  };

  const closeHandle = async (handle: FileHandle | null) => {
    if (handle == null) return;
    await handle.close();
  };

  const queueCurrentPath = async (filePath: string, previousState: ReadState) => {
    const nextHandle = await fs.open(filePath, "r");
    let nextStat: Awaited<ReturnType<FileHandle["stat"]>>;
    try {
      nextStat = await nextHandle.stat();
    } catch (error) {
      await nextHandle.close();
      throw error;
    }
    const nextIdentity = resolveFileIdentity(nextStat);
    if (nextIdentity != null && nextIdentity === previousState.identity) {
      await nextHandle.close();
      return;
    }
    previousState.retiredAt = Date.now();
    readStates.push({
      handle: nextHandle,
      identity: nextIdentity,
      offset: 0,
      buffer: Buffer.alloc(0),
      retiredAt: null,
      stableEofPolls: 0,
    });
  };

  const drainQueuedStates = async () => {
    while (readStates.length > 0) {
      const state = readStates[0]!;
      const bytesRead = await drainState(state);
      if (state.retiredAt == null) {
        return;
      }

      state.stableEofPolls = bytesRead === 0 ? state.stableEofPolls + 1 : 0;
      const retiredForMs = Date.now() - state.retiredAt;
      const hasStableEof =
        retiredForMs >= RETIRED_MIN_GRACE_MS && state.stableEofPolls >= RETIRED_STABLE_EOF_POLLS;
      const retentionExpired = retiredForMs >= RETIRED_MAX_GRACE_MS;
      if (!hasStableEof && !retentionExpired) {
        return;
      }

      await state.handle.close();
      readStates.shift();
    }
  };

  const start = async (filePath: string): Promise<void> => {
    if (timer || readStates.length > 0) {
      return;
    }
    const initialHandle = await fs.open(filePath, "r");
    let initialStat: Awaited<ReturnType<FileHandle["stat"]>>;
    try {
      initialStat = await initialHandle.stat();
    } catch (error) {
      await initialHandle.close();
      throw error;
    }
    stopping = false;
    readStates = [
      {
        handle: initialHandle,
        identity: resolveFileIdentity(initialStat),
        offset: initialStat.size,
        buffer: Buffer.alloc(0),
        retiredAt: null,
        stableEofPolls: 0,
      },
    ];

    const poll = async (): Promise<void> => {
      if (pollPromise != null || stopping) {
        return;
      }
      const pending = (async () => {
        const currentState = readStates[readStates.length - 1];
        if (currentState == null) return;
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat) {
          const statIdentity = resolveFileIdentity(stat);
          if (
            statIdentity != null &&
            currentState.identity != null &&
            statIdentity !== currentState.identity
          ) {
            await queueCurrentPath(filePath, currentState);
          }
        }
        await drainQueuedStates();
      })();
      pollPromise = pending;
      try {
        await pending;
      } finally {
        if (pollPromise === pending) pollPromise = null;
      }
    };
    timer = setInterval(() => {
      void poll().catch(() => null);
    }, pollIntervalMs);
  };

  const stop = async (): Promise<void> => {
    stopping = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await pollPromise?.catch(() => undefined);
    const states = readStates;
    readStates = [];
    for (const state of states) {
      await drainState(state).catch(() => undefined);
      await closeHandle(state.handle);
    }
  };

  return { onLine, start, stop };
};
