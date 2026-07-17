type CreateStateSaveHeartbeatOptions = {
  intervalMs: number;
  // Monotonic by default: a wall-clock step backwards must not stall the
  // heartbeat, so Date.now() is not used here.
  now?: () => number;
};

export type StateSaveHeartbeat = {
  isDue: () => boolean;
  markWritten: () => void;
};

export const createStateSaveHeartbeat = ({
  intervalMs,
  now = () => performance.now(),
}: CreateStateSaveHeartbeatOptions): StateSaveHeartbeat => {
  let lastWrittenAt: number | null = null;
  return {
    isDue: () => lastWrittenAt != null && now() - lastWrittenAt >= intervalMs,
    markWritten: () => {
      lastWrittenAt = now();
    },
  };
};
