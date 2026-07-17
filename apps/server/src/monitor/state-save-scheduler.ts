const DEFAULT_SAVE_COALESCE_MS = 3000;

type CreateStateSaveSchedulerOptions = {
  save: () => void;
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export type StateSaveScheduler = {
  schedule: () => void;
  /** Returns false when a pending save was attempted and failed. */
  flush: () => boolean;
  /** Returns false when the final flush failed. */
  dispose: () => boolean;
};

export const createStateSaveScheduler = ({
  save,
  intervalMs = DEFAULT_SAVE_COALESCE_MS,
  onError,
}: CreateStateSaveSchedulerOptions): StateSaveScheduler => {
  let dirty = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const runSave = () => {
    dirty = false;
    try {
      save();
      return true;
    } catch (error) {
      // Keep the dirty flag so the next schedule() or flush() retries the write.
      dirty = true;
      onError?.(error);
      return false;
    }
  };

  const flush = () => {
    clearTimer();
    if (!dirty) {
      return true;
    }
    return runSave();
  };

  const schedule = () => {
    dirty = true;
    if (disposed) {
      // Writers that fire during shutdown persist immediately; the timer is gone.
      flush();
      return;
    }
    if (timer != null) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      if (!dirty) {
        return;
      }
      runSave();
    }, intervalMs);
    // The happy-dom test environment returns a number handle without unref.
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
  };

  const dispose = () => {
    disposed = true;
    return flush();
  };

  return { schedule, flush, dispose };
};
