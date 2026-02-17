import type { ScreenMode } from "@/lib/screen-loading";

export const SCREEN_POLL_INTERVAL_MS = {
  text: 1000,
  image: 2000,
} as const;

export const resolveScreenPollIntervalMs = (mode: ScreenMode) =>
  mode === "image" ? SCREEN_POLL_INTERVAL_MS.image : SCREEN_POLL_INTERVAL_MS.text;
