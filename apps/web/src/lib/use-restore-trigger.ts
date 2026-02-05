import { useEffect, useRef } from "react";

type RestoreListener = () => void;

const listeners = new Set<RestoreListener>();
let installed = false;
let lastTriggerAt = 0;
let activeSubscriptions = 0;

const canTrigger = () => {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  return true;
};

const triggerRefresh = () => {
  if (!canTrigger()) {
    return;
  }
  const now = Date.now();
  if (now - lastTriggerAt < 1000) {
    return;
  }
  lastTriggerAt = now;
  listeners.forEach((listener) => listener());
};

const installListeners = () => {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      triggerRefresh();
    }
  };
  const handleFocus = () => {
    triggerRefresh();
  };
  const handleOnline = () => {
    triggerRefresh();
  };
  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted || document.visibilityState === "visible") {
      triggerRefresh();
    }
  };
  window.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("online", handleOnline);
  window.addEventListener("pageshow", handlePageShow);

  return () => {
    window.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("pageshow", handlePageShow);
  };
};

let cleanupListeners: (() => void) | null = null;

const ensureInstalled = () => {
  if (!installed) {
    cleanupListeners = installListeners() ?? null;
  }
};

const ensureUninstalled = () => {
  if (installed && activeSubscriptions === 0 && cleanupListeners) {
    cleanupListeners();
    cleanupListeners = null;
    installed = false;
  }
};

export const useRestoreTrigger = (onRestore: () => void) => {
  const restoreRef = useRef(onRestore);
  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    ensureInstalled();
    activeSubscriptions += 1;
    const listener = () => restoreRef.current();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      activeSubscriptions = Math.max(0, activeSubscriptions - 1);
      ensureUninstalled();
    };
  }, []);
};
