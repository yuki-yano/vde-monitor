import type { ScreenMode } from "@/lib/screen-loading";

type ScreenFetchInFlight = {
  id: number;
  contextKey: string;
};

type ScreenFetchModeLoadedState = {
  text: boolean;
  image: boolean;
};

export type ScreenFetchLifecycleAttempt = {
  requestId: number;
  contextKey: string;
  isModeSwitch: boolean;
  shouldShowLoading: boolean;
};

type ScreenFetchLifecycleState = {
  inFlight: ScreenFetchInFlight | null;
  nextRequestId: number;
  latestAttempt: ScreenFetchLifecycleAttempt | null;
};

export type ScreenFetchLifecycleAction =
  | {
      type: "request";
      contextKey: string;
      mode: ScreenMode;
      modeSwitch: ScreenMode | null;
      modeLoaded: ScreenFetchModeLoadedState;
      hasCurrentData: boolean;
    }
  | { type: "finish"; requestId: number }
  | { type: "reset" };

export const initialScreenFetchLifecycleState: ScreenFetchLifecycleState = {
  inFlight: null,
  nextRequestId: 1,
  latestAttempt: null,
};

export const screenFetchLifecycleReducer = (
  state: ScreenFetchLifecycleState,
  action: ScreenFetchLifecycleAction,
): ScreenFetchLifecycleState => {
  if (action.type === "request") {
    if (state.inFlight?.contextKey === action.contextKey) {
      return {
        ...state,
        latestAttempt: null,
      };
    }
    const requestId = state.nextRequestId;
    const isModeSwitch = action.modeSwitch === action.mode;
    const shouldShowLoading =
      isModeSwitch || !action.modeLoaded[action.mode] || !action.hasCurrentData;
    return {
      inFlight: {
        id: requestId,
        contextKey: action.contextKey,
      },
      nextRequestId: requestId + 1,
      latestAttempt: {
        requestId,
        contextKey: action.contextKey,
        isModeSwitch,
        shouldShowLoading,
      },
    };
  }
  if (action.type === "finish") {
    if (state.inFlight?.id !== action.requestId) {
      return state;
    }
    return {
      ...state,
      inFlight: null,
      latestAttempt: null,
    };
  }
  if (action.type === "reset") {
    return {
      ...state,
      inFlight: null,
      latestAttempt: null,
    };
  }
  return state;
};
