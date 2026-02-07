import type { CaptureOptions } from "./capture-macos";
import { captureTerminalScreenMacos } from "./capture-macos";

export type { CaptureOptions } from "./capture-macos";

const isMacOSPlatform = (platform: NodeJS.Platform) => platform === "darwin";

export const captureTerminalScreen = async (
  tty: string | null | undefined,
  options: CaptureOptions = {},
  platform: NodeJS.Platform = process.platform,
) => {
  if (!isMacOSPlatform(platform)) {
    return null;
  }
  return captureTerminalScreenMacos(tty, options);
};
