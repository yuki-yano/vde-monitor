import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { type ScreenWrapMode, screenWrapModeAtom } from "../atoms/screenAtoms";

const SCREEN_WRAP_MODE_STORAGE_KEY = "vde-monitor-session-detail-screen-wrap-mode";

const isScreenWrapMode = (value: string | null): value is ScreenWrapMode =>
  value === "off" || value === "smart";

const readStoredWrapMode = (): ScreenWrapMode | null => {
  try {
    const stored = window.localStorage.getItem(SCREEN_WRAP_MODE_STORAGE_KEY);
    return isScreenWrapMode(stored) ? stored : null;
  } catch {
    return null;
  }
};

const writeStoredWrapMode = (wrapMode: ScreenWrapMode) => {
  try {
    window.localStorage.setItem(SCREEN_WRAP_MODE_STORAGE_KEY, wrapMode);
  } catch {
    // ignore storage errors
  }
};

export const useScreenWrapMode = () => {
  const [wrapMode, setWrapModeAtom] = useAtom(screenWrapModeAtom);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }
    loadedRef.current = true;
    const stored = readStoredWrapMode();
    if (stored && stored !== wrapMode) {
      setWrapModeAtom(stored);
    }
  }, [setWrapModeAtom, wrapMode]);

  const setWrapMode = useCallback(
    (nextWrapMode: ScreenWrapMode) => {
      setWrapModeAtom(nextWrapMode);
      writeStoredWrapMode(nextWrapMode);
    },
    [setWrapModeAtom],
  );

  const toggleWrapMode = useCallback(() => {
    setWrapMode(wrapMode === "smart" ? "off" : "smart");
  }, [setWrapMode, wrapMode]);

  return {
    wrapMode,
    setWrapMode,
    toggleWrapMode,
  };
};

export const __testables = {
  SCREEN_WRAP_MODE_STORAGE_KEY,
};
