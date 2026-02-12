import type { ScreenMode } from "@/lib/screen-loading";

export type ScreenFetchInFlight = {
  id: number;
  mode: ScreenMode;
};

export type ScreenFetchLifecycleState = {
  inFlight: ScreenFetchInFlight | null;
};

export type ScreenFetchLifecycleAction =
  | { type: "start"; requestId: number; mode: ScreenMode }
  | { type: "finish"; requestId: number }
  | { type: "reset" };

export const initialScreenFetchLifecycleState: ScreenFetchLifecycleState = {
  inFlight: null,
};

export const screenFetchLifecycleReducer = (
  state: ScreenFetchLifecycleState,
  action: ScreenFetchLifecycleAction,
): ScreenFetchLifecycleState => {
  if (action.type === "start") {
    return {
      inFlight: {
        id: action.requestId,
        mode: action.mode,
      },
    };
  }
  if (action.type === "finish") {
    if (state.inFlight?.id !== action.requestId) {
      return state;
    }
    return { inFlight: null };
  }
  return initialScreenFetchLifecycleState;
};
