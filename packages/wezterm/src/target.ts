import { normalizeWeztermTarget } from "@vde-monitor/shared";

export const buildWeztermTargetArgs = (target: string | null | undefined): string[] => {
  const normalized = normalizeWeztermTarget(target);
  if (normalized === "auto") {
    return [];
  }
  return ["--target", normalized];
};
