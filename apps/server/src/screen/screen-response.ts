import type {
  AgentMonitorConfig,
  ScreenCaptureMeta,
  ScreenResponse,
  SessionDetail,
} from "@vde-monitor/shared";

import { buildError, nowIso } from "../http/helpers";
import type { createSessionMonitor } from "../monitor";
import { isEditorCommand } from "../monitor/agent-resolver-utils";
import { captureTerminalScreen } from "../screen-service";
import type { ScreenCache } from "./screen-cache";

type Monitor = ReturnType<typeof createSessionMonitor>;
type ScreenLimiter = (key: string) => boolean;

type ScreenResponseParams = {
  config: AgentMonitorConfig;
  monitor: Monitor;
  target: SessionDetail;
  mode?: "text" | "image";
  lines?: number;
  cursor?: string;
  screenLimiter: ScreenLimiter;
  limiterKey: string;
  buildTextResponse: ScreenCache["buildTextResponse"];
};

const resolveRequestedJoinLines = (config: AgentMonitorConfig) => config.screen.joinLines;

const resolveCaptureBackend = (config: AgentMonitorConfig): ScreenCaptureMeta["backend"] =>
  config.multiplexer.backend === "tmux" || config.multiplexer.backend === "wezterm"
    ? config.multiplexer.backend
    : "unknown";

const resolveAppliedJoinLines = ({
  backend,
  joinLinesRequested,
}: {
  backend: ScreenCaptureMeta["backend"];
  joinLinesRequested: boolean;
}) => (backend === "tmux" ? joinLinesRequested : false);

const buildNoneCaptureMeta = (): ScreenCaptureMeta => ({
  backend: "unknown",
  lineModel: "none",
  joinLinesApplied: null,
  captureMethod: "none",
});

const buildTextCaptureMeta = ({
  backend,
  joinLinesApplied,
}: {
  backend: ScreenCaptureMeta["backend"];
  joinLinesApplied: boolean;
}): ScreenCaptureMeta => {
  const lineModel =
    backend === "tmux"
      ? joinLinesApplied
        ? "joined-physical"
        : "physical"
      : backend === "wezterm"
        ? "physical"
        : "none";
  const captureMethod =
    backend === "tmux" ? "tmux-capture-pane" : backend === "wezterm" ? "wezterm-get-text" : "none";

  return {
    backend,
    lineModel,
    joinLinesApplied,
    captureMethod,
  };
};

const buildImageCaptureMeta = (backend: ScreenCaptureMeta["backend"]): ScreenCaptureMeta => ({
  backend,
  lineModel: "none",
  joinLinesApplied: null,
  captureMethod: "terminal-image",
});

const resolveAltScreenMode = (config: AgentMonitorConfig, target: SessionDetail) => {
  if (isEditorCommand(target.currentCommand) || isEditorCommand(target.startCommand)) {
    return "on" as const;
  }
  return config.screen.altScreen;
};

export const createScreenResponse = async ({
  config,
  monitor,
  target,
  mode,
  lines,
  cursor,
  screenLimiter,
  limiterKey,
  buildTextResponse,
}: ScreenResponseParams): Promise<ScreenResponse> => {
  const lineCount = Math.min(lines ?? config.screen.defaultLines, config.screen.maxLines);
  const backend = resolveCaptureBackend(config);
  const joinLinesRequested = resolveRequestedJoinLines(config);
  const joinLinesApplied = resolveAppliedJoinLines({ backend, joinLinesRequested });
  const textCaptureMeta = buildTextCaptureMeta({ backend, joinLinesApplied });

  const captureTextResponse = async (
    fallbackReason?: "image_failed" | "image_disabled",
    applyCursor = true,
  ): Promise<ScreenResponse> => {
    try {
      const text = await monitor.getScreenCapture().captureText({
        paneId: target.paneId,
        lines: lineCount,
        joinLines: joinLinesApplied,
        includeAnsi: config.screen.ansi,
        includeTruncated: config.screen.includeTruncated,
        altScreen: resolveAltScreenMode(config, target),
        alternateOn: target.alternateOn,
        currentCommand: target.currentCommand ?? target.startCommand,
      });
      return buildTextResponse({
        paneId: target.paneId,
        lineCount,
        screen: text.screen,
        alternateOn: text.alternateOn,
        truncated: text.truncated,
        captureMeta: textCaptureMeta,
        cursor: applyCursor ? cursor : undefined,
        fallbackReason,
      });
    } catch {
      return {
        ok: false,
        paneId: target.paneId,
        mode: "text",
        capturedAt: nowIso(),
        captureMeta: buildNoneCaptureMeta(),
        error: buildError("INTERNAL", "screen capture failed"),
      };
    }
  };

  if (!screenLimiter(limiterKey)) {
    return {
      ok: false,
      paneId: target.paneId,
      mode: "text",
      capturedAt: nowIso(),
      captureMeta: buildNoneCaptureMeta(),
      error: buildError("RATE_LIMIT", "rate limited"),
    };
  }

  const effectiveMode = mode ?? config.screen.mode;

  if (effectiveMode === "image") {
    if (!config.screen.image.enabled) {
      return captureTextResponse("image_disabled", false);
    }
    const multiplexerBackend = config.multiplexer.backend;
    if (multiplexerBackend !== "tmux" && multiplexerBackend !== "wezterm") {
      return captureTextResponse("image_disabled", false);
    }
    const imageResult = await captureTerminalScreen(target.paneTty, {
      paneId: target.paneId,
      multiplexerBackend,
      tmux: config.tmux,
      wezterm: config.multiplexer.wezterm,
      cropPane: config.screen.image.cropPane,
      backend: config.screen.image.backend,
    });
    if (imageResult) {
      return {
        ok: true,
        paneId: target.paneId,
        mode: "image",
        capturedAt: nowIso(),
        captureMeta: buildImageCaptureMeta(backend),
        imageBase64: imageResult.imageBase64,
        cropped: imageResult.cropped,
      };
    }
    return captureTextResponse("image_failed", false);
  }

  return captureTextResponse();
};
