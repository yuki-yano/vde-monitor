import {
  type CaptureOptions,
  captureTerminalScreen as captureTerminalScreenImpl,
} from "./screen/capture";

export const captureTerminalScreen = async (
  tty: string | null | undefined,
  options: CaptureOptions = {},
) => {
  return captureTerminalScreenImpl(tty, options);
};
