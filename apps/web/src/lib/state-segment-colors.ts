import type { SessionStateValue } from "@vde-monitor/shared";

export const SEGMENT_COLOR_CLASS: Record<SessionStateValue, string> = {
  RUNNING: "bg-latte-green/80",
  WAITING_INPUT: "bg-latte-peach/80",
  WAITING_PERMISSION: "bg-latte-red/80",
  DONE: "bg-latte-blue/80",
  SHELL: "bg-latte-blue/80",
  UNKNOWN: "bg-latte-overlay0/80",
};
