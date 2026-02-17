import type { TextCaptureOptions, TextCaptureResult } from "@vde-monitor/shared";

import type { WeztermAdapter } from "./adapter";

export type { TextCaptureOptions, TextCaptureResult };

const normalizeLines = (text: string) => {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }
  return lines;
};

export const createScreenCapture = (adapter: WeztermAdapter) => {
  const captureText = async (options: TextCaptureOptions): Promise<TextCaptureResult> => {
    const args = ["get-text", "--pane-id", options.paneId, "--start-line", `-${options.lines}`];
    if (options.includeAnsi) {
      args.push("--escapes");
    }
    const result = await adapter.run(args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "wezterm get-text failed");
    }
    const allLines = normalizeLines(result.stdout);
    const truncatedFlag = allLines.length > options.lines;
    const visible = truncatedFlag ? allLines.slice(-options.lines) : allLines;
    const truncated = (options.includeTruncated ?? true) ? truncatedFlag : null;
    return {
      screen: visible.join("\n"),
      truncated,
      alternateOn: false,
    };
  };

  return { captureText };
};
