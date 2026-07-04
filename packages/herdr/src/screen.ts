import { type MultiplexerScreenCapture, normalizeLines } from "@vde-monitor/multiplexer";
import type { TextCaptureOptions, TextCaptureResult } from "@vde-monitor/shared";

import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

type HerdrPaneReadResult = {
  read?: {
    text?: unknown;
    truncated?: unknown;
  };
};

export const createHerdrScreenCapture = (client: HerdrRequester): MultiplexerScreenCapture => {
  const captureText = async (options: TextCaptureOptions): Promise<TextCaptureResult> => {
    const result = await client.request<HerdrPaneReadResult>(HERDR_METHODS.paneRead, {
      pane_id: options.paneId,
      source: "visible",
      lines: options.lines,
      format: options.includeAnsi ? "ansi" : "text",
      strip_ansi: !options.includeAnsi,
    });

    const text = typeof result.read?.text === "string" ? result.read.text : "";
    const allLines = normalizeLines(text);
    const truncatedByLineCount = allLines.length > options.lines;
    const visible = truncatedByLineCount ? allLines.slice(-options.lines) : allLines;
    const truncatedFlag = result.read?.truncated === true || truncatedByLineCount;
    const truncated = (options.includeTruncated ?? true) ? truncatedFlag : null;

    return {
      screen: visible.join("\n"),
      truncated,
      alternateOn: false,
    };
  };

  return { captureText };
};
