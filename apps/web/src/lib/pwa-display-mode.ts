const DISPLAY_MODE_QUERIES = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: window-controls-overlay)",
] as const;

const matchesDisplayMode = (query: string) => {
  try {
    return window.matchMedia?.(query)?.matches === true;
  } catch {
    return false;
  }
};

export const isPwaDisplayMode = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (DISPLAY_MODE_QUERIES.some((query) => matchesDisplayMode(query))) {
    return true;
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
};

export const PWA_DISPLAY_MODE_QUERIES = DISPLAY_MODE_QUERIES;
