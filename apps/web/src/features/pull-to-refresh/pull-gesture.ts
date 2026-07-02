export type PullGestureConfig = {
  /** Vertical distance the finger must travel before the pull visual starts. Keeps taps (with natural drift) untouched. */
  activationDistancePx: number;
  resistance: number;
  maxPullDistancePx: number;
  refreshThresholdPx: number;
};

export const DEFAULT_PULL_GESTURE_CONFIG: PullGestureConfig = {
  activationDistancePx: 12,
  resistance: 1.2,
  maxPullDistancePx: 108,
  refreshThresholdPx: 72,
};

export type PullGesturePhase = "idle" | "tracking" | "pulling";

export type PullGestureMoveResult = {
  phase: PullGesturePhase;
  pullDistancePx: number;
  preventDefault: boolean;
};

const IDLE_MOVE_RESULT: PullGestureMoveResult = {
  phase: "idle",
  pullDistancePx: 0,
  preventDefault: false,
};

export const createPullGestureTracker = (config: PullGestureConfig) => {
  let phase: PullGesturePhase = "idle";
  let startX = 0;
  let startY = 0;
  let pullDistancePx = 0;

  const reset = () => {
    phase = "idle";
    pullDistancePx = 0;
  };

  const start = (x: number, y: number, canPull: boolean) => {
    if (!canPull) {
      reset();
      return;
    }
    phase = "tracking";
    startX = x;
    startY = y;
    pullDistancePx = 0;
  };

  const move = (x: number, y: number): PullGestureMoveResult => {
    if (phase === "idle") {
      return IDLE_MOVE_RESULT;
    }
    const dx = x - startX;
    const dy = y - startY;
    if (phase === "tracking") {
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        reset();
        return IDLE_MOVE_RESULT;
      }
      if (dy < config.activationDistancePx) {
        return { phase: "tracking", pullDistancePx: 0, preventDefault: false };
      }
      phase = "pulling";
    }
    if (dy <= 0) {
      reset();
      return IDLE_MOVE_RESULT;
    }
    pullDistancePx = Math.min(
      Math.max(dy - config.activationDistancePx, 0) / config.resistance,
      config.maxPullDistancePx,
    );
    return { phase: "pulling", pullDistancePx, preventDefault: true };
  };

  const end = () => {
    const shouldRefresh = phase === "pulling" && pullDistancePx >= config.refreshThresholdPx;
    reset();
    return { shouldRefresh };
  };

  return { start, move, end, cancel: reset };
};

export type PullGestureTracker = ReturnType<typeof createPullGestureTracker>;
