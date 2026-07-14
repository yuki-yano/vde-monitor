import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../activity-suppressor", () => ({
  markPaneFocus: vi.fn(),
}));

vi.mock("./crop", () => ({
  cropPaneBounds: vi.fn(),
}));

vi.mock("./macos-app", () => ({
  resolveBackendApp: vi.fn(),
}));

vi.mock("./macos-applescript", () => ({
  focusTerminalApp: vi.fn(),
  isAppRunning: vi.fn(),
  runAppleScript: vi.fn(),
}));

vi.mock("./macos-bounds", () => ({
  buildTerminalBoundsScript: vi.fn(),
  parseBoundsSet: vi.fn(),
}));

vi.mock("./macos-screencapture", () => ({
  captureRegion: vi.fn(),
}));

vi.mock("./tmux-geometry", () => ({
  focusTmuxPane: vi.fn(),
  getPaneGeometry: vi.fn(),
}));

vi.mock("./wezterm-geometry", () => ({
  focusWeztermPane: vi.fn(),
  getWeztermPaneGeometry: vi.fn(),
}));

vi.mock("./tty", () => ({
  isValidTty: vi.fn(),
}));

import { markPaneFocus } from "../activity-suppressor";
import { captureTerminalScreenMacos } from "./capture-macos";
import { cropPaneBounds } from "./crop";
import { resolveBackendApp } from "./macos-app";
import { focusTerminalApp, isAppRunning, runAppleScript } from "./macos-applescript";
import { buildTerminalBoundsScript, parseBoundsSet } from "./macos-bounds";
import { captureRegion } from "./macos-screencapture";
import { focusTmuxPane, getPaneGeometry } from "./tmux-geometry";
import { isValidTty } from "./tty";
import { focusWeztermPane, getWeztermPaneGeometry } from "./wezterm-geometry";

const baseBounds = { x: 0, y: 0, width: 200, height: 100 };
const croppedBounds = { x: 12, y: 8, width: 100, height: 50 };
const paneGeometry = {
  left: 10,
  top: 6,
  width: 80,
  height: 40,
  windowWidth: 160,
  windowHeight: 80,
  panePixelWidth: 120,
  panePixelHeight: 50,
};

const settleCapture = async <T>(promise: Promise<T>) => {
  await vi.runAllTimersAsync();
  return promise;
};

describe("captureTerminalScreenMacos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(isValidTty).mockReturnValue(true);
    vi.mocked(resolveBackendApp).mockReturnValue({
      key: "terminal",
      appName: "Terminal",
    });
    vi.mocked(isAppRunning).mockResolvedValue(true);
    vi.mocked(focusTerminalApp).mockResolvedValue(undefined);
    vi.mocked(focusTmuxPane).mockResolvedValue(undefined);
    vi.mocked(buildTerminalBoundsScript).mockReturnValue("SCRIPT");
    vi.mocked(runAppleScript).mockResolvedValue("raw");
    vi.mocked(parseBoundsSet).mockReturnValue({
      content: baseBounds,
      window: null,
    });
    vi.mocked(getPaneGeometry).mockResolvedValue(paneGeometry);
    vi.mocked(getWeztermPaneGeometry).mockResolvedValue(paneGeometry);
    vi.mocked(cropPaneBounds).mockReturnValue(croppedBounds);
    vi.mocked(captureRegion).mockResolvedValue("image-data");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when tty is invalid", async () => {
    vi.mocked(isValidTty).mockReturnValue(false);

    const result = await captureTerminalScreenMacos("not-a-tty");

    expect(result).toBeNull();
    expect(resolveBackendApp).not.toHaveBeenCalled();
  });

  it("captures a cropped image when paneId is provided", async () => {
    const capturePromise = captureTerminalScreenMacos("/dev/ttys001", {
      paneId: "%1",
      tmux: { socketName: "sock" },
    });

    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "image-data", cropped: true });
    expect(markPaneFocus).toHaveBeenCalledWith("%1");
    expect(focusTmuxPane).toHaveBeenCalledWith("%1", { socketName: "sock" });
    expect(runAppleScript).toHaveBeenCalledWith("SCRIPT");
    expect(getPaneGeometry).toHaveBeenCalledWith("%1", { socketName: "sock" });
    expect(captureRegion).toHaveBeenCalledWith(croppedBounds);
  });

  it("focuses and crops pane using wezterm geometry when backend is wezterm", async () => {
    const capturePromise = captureTerminalScreenMacos("/dev/ttys001", {
      paneId: "6",
      multiplexerBackend: "wezterm",
      wezterm: { cliPath: "/bin/wezterm", target: "dev" },
    });

    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "image-data", cropped: true });
    expect(markPaneFocus).toHaveBeenCalledWith("6");
    expect(focusWeztermPane).toHaveBeenCalledWith("6", {
      cliPath: "/bin/wezterm",
      target: "dev",
    });
    expect(getWeztermPaneGeometry).toHaveBeenCalledWith("6", {
      cliPath: "/bin/wezterm",
      target: "dev",
    });
    expect(focusTmuxPane).not.toHaveBeenCalled();
    expect(getPaneGeometry).not.toHaveBeenCalled();
  });

  it("uses content bounds directly when wezterm scroll area already matches active pane", async () => {
    const activePaneBounds = { x: 40, y: 20, width: 120, height: 50 };
    vi.mocked(parseBoundsSet).mockReturnValue({
      content: activePaneBounds,
      window: baseBounds,
    });

    const capturePromise = captureTerminalScreenMacos("/dev/ttys001", {
      paneId: "6",
      multiplexerBackend: "wezterm",
      wezterm: { target: "dev" },
    });
    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "image-data", cropped: true });
    expect(captureRegion).toHaveBeenCalledWith(activePaneBounds);
    expect(cropPaneBounds).not.toHaveBeenCalled();
  });

  it("adjusts wezterm content bounds before cropping when frame includes window padding", async () => {
    const windowLikeBounds = { x: 496, y: 1353, width: 968, height: 484 };
    vi.mocked(parseBoundsSet).mockReturnValue({
      content: windowLikeBounds,
      window: windowLikeBounds,
    });
    vi.mocked(getWeztermPaneGeometry).mockResolvedValue({
      left: 0,
      top: 0,
      width: 59,
      height: 14,
      windowWidth: 120,
      windowHeight: 30,
      panePixelWidth: 472,
      panePixelHeight: 224,
    });

    const capturePromise = captureTerminalScreenMacos("/dev/ttys001", {
      paneId: "3",
      multiplexerBackend: "wezterm",
    });
    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "image-data", cropped: true });
    expect(cropPaneBounds).toHaveBeenCalledWith(
      { x: 500, y: 1355, width: 960, height: 480 },
      expect.objectContaining({ width: 59, height: 14, windowWidth: 120, windowHeight: 30 }),
    );
  });

  it("falls back to uncropped window capture when content bounds are unavailable", async () => {
    vi.mocked(parseBoundsSet).mockReturnValue({
      content: null,
      window: baseBounds,
    });

    const capturePromise = captureTerminalScreenMacos("/dev/ttys001", {
      paneId: "%1",
    });
    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "image-data", cropped: false });
    expect(runAppleScript).toHaveBeenCalledTimes(3);
    expect(cropPaneBounds).not.toHaveBeenCalled();
    expect(captureRegion).toHaveBeenCalledTimes(1);
    expect(captureRegion).toHaveBeenCalledWith(baseBounds);
  });

  it("retries capture until image is available", async () => {
    vi.mocked(captureRegion).mockResolvedValueOnce(null).mockResolvedValueOnce("image-after-retry");

    const capturePromise = captureTerminalScreenMacos("/dev/ttys001");
    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "image-after-retry", cropped: false });
    expect(captureRegion).toHaveBeenCalledTimes(2);
    expect(getPaneGeometry).not.toHaveBeenCalled();
  });

  it("falls back to uncropped capture on final attempt when cropped region capture fails", async () => {
    vi.mocked(captureRegion)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("window-image");

    const capturePromise = captureTerminalScreenMacos("/dev/ttys001", {
      paneId: "%1",
    });
    const result = await settleCapture(capturePromise);

    expect(result).toEqual({ imageBase64: "window-image", cropped: false });
    expect(captureRegion).toHaveBeenCalledTimes(4);
    expect(captureRegion).toHaveBeenNthCalledWith(1, croppedBounds);
    expect(captureRegion).toHaveBeenNthCalledWith(2, croppedBounds);
    expect(captureRegion).toHaveBeenNthCalledWith(3, croppedBounds);
    expect(captureRegion).toHaveBeenNthCalledWith(4, baseBounds);
  });

  it("serializes focus and capture across concurrent pane requests", async () => {
    let resolveFirstCapture: (value: string | null) => void = () => undefined;
    vi.mocked(captureRegion)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstCapture = resolve;
        }),
      )
      .mockResolvedValueOnce("pane-2-image");

    const first = captureTerminalScreenMacos("/dev/ttys001", { paneId: "%1" });
    const second = captureTerminalScreenMacos("/dev/ttys002", { paneId: "%2" });
    await vi.advanceTimersByTimeAsync(400);

    expect(focusTmuxPane).toHaveBeenCalledTimes(1);
    expect(focusTmuxPane).toHaveBeenNthCalledWith(1, "%1", undefined);

    resolveFirstCapture("pane-1-image");
    await vi.advanceTimersByTimeAsync(400);

    await expect(first).resolves.toEqual({ imageBase64: "pane-1-image", cropped: true });
    await expect(second).resolves.toEqual({ imageBase64: "pane-2-image", cropped: true });
    expect(focusTmuxPane).toHaveBeenNthCalledWith(2, "%2", undefined);
    expect(captureRegion).toHaveBeenNthCalledWith(1, croppedBounds);
    expect(captureRegion).toHaveBeenNthCalledWith(2, croppedBounds);
  });

  it("drops capture requests when the serialized focus queue is full", async () => {
    let resolveFirstCapture: (value: string | null) => void = () => undefined;
    vi.mocked(captureRegion)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstCapture = resolve;
        }),
      )
      .mockResolvedValueOnce("pane-2-image")
      .mockResolvedValueOnce("pane-3-image");

    const first = captureTerminalScreenMacos("/dev/ttys001", { paneId: "%1" });
    const second = captureTerminalScreenMacos("/dev/ttys002", { paneId: "%2" });
    const third = captureTerminalScreenMacos("/dev/ttys003", { paneId: "%3" });
    const overflow = captureTerminalScreenMacos("/dev/ttys004", { paneId: "%4" });
    await vi.advanceTimersByTimeAsync(400);

    await expect(overflow).resolves.toBeNull();
    expect(focusTmuxPane).toHaveBeenCalledTimes(1);
    expect(isAppRunning).toHaveBeenCalledTimes(1);

    resolveFirstCapture("pane-1-image");
    await vi.advanceTimersByTimeAsync(800);

    await expect(first).resolves.toEqual({ imageBase64: "pane-1-image", cropped: true });
    await expect(second).resolves.toEqual({ imageBase64: "pane-2-image", cropped: true });
    await expect(third).resolves.toEqual({ imageBase64: "pane-3-image", cropped: true });
    expect(focusTmuxPane).toHaveBeenCalledTimes(3);
    expect(isAppRunning).toHaveBeenCalledTimes(3);
  });

  it("releases the serialized focus slot when an active capture throws", async () => {
    vi.mocked(focusTmuxPane).mockRejectedValueOnce(new Error("focus failed"));
    vi.mocked(captureRegion).mockResolvedValueOnce("pane-2-image");

    const first = captureTerminalScreenMacos("/dev/ttys001", { paneId: "%1" });
    const firstFailure = expect(first).rejects.toThrow("focus failed");
    const second = captureTerminalScreenMacos("/dev/ttys002", { paneId: "%2" });
    await vi.runAllTimersAsync();

    await firstFailure;
    await expect(second).resolves.toEqual({ imageBase64: "pane-2-image", cropped: true });
    expect(focusTmuxPane).toHaveBeenCalledTimes(2);
  });
});
