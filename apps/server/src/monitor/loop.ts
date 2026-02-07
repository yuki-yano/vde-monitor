import { rotateLogIfNeeded } from "../logs";

type LoopDeps = {
  rotateLogIfNeeded?: typeof rotateLogIfNeeded;
};

type LoopArgs = {
  intervalMs: number;
  eventLogPath: string;
  maxEventLogBytes: number;
  retainRotations: number;
  updateFromPanes: () => Promise<void>;
};

export const createMonitorLoop = (
  { intervalMs, eventLogPath, maxEventLogBytes, retainRotations, updateFromPanes }: LoopArgs,
  deps: LoopDeps = {},
) => {
  const rotate = deps.rotateLogIfNeeded ?? rotateLogIfNeeded;
  let timer: NodeJS.Timeout | null = null;
  let tickRunning = false;

  const tick = async () => {
    if (tickRunning) {
      return;
    }
    tickRunning = true;
    try {
      await Promise.allSettled([
        updateFromPanes(),
        rotate(eventLogPath, maxEventLogBytes, retainRotations),
      ]);
    } finally {
      tickRunning = false;
    }
  };

  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      void tick();
    }, intervalMs);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { start, stop };
};
