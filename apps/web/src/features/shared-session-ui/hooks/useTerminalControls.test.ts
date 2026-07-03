import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTerminalControls } from "./useTerminalControls";

describe("useTerminalControls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderControls = (
    overrides: Partial<Parameters<typeof useTerminalControls>[0]> & {
      sendKeys?: Parameters<typeof useTerminalControls>[0]["sendKeys"];
      sendRaw?: Parameters<typeof useTerminalControls>[0]["sendRaw"];
    } = {},
  ) => {
    const sendKeys = overrides.sendKeys ?? vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = overrides.sendRaw ?? vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();

    const { result } = renderHook(() => {
      const [autoEnter, setAutoEnter] = useState(true);
      const [rawMode, setRawMode] = useState(false);
      const [allowDangerKeys, setAllowDangerKeys] = useState(false);
      const controls = useTerminalControls({
        paneId: "pane-1",
        ctrlHeld: false,
        shiftHeld: false,
        rawMode,
        allowDangerKeys,
        autoEnter,
        sendKeys,
        sendRaw,
        setAutoEnter,
        setRawMode,
        setAllowDangerKeys,
        setScreenError,
        ...overrides,
      });
      return { controls, autoEnter, rawMode, allowDangerKeys, setAllowDangerKeys };
    });

    return { result, sendKeys, sendRaw, setScreenError };
  };

  it("sends a mapped key via sendKeys outside raw mode", async () => {
    const { result, sendKeys, setScreenError } = renderControls();

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(sendKeys).toHaveBeenCalledWith("pane-1", ["Enter"]);
    expect(setScreenError).toHaveBeenCalledWith(null);
  });

  it("blocks a dangerous key when confirmation is declined", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { result, sendKeys } = renderControls();

    await act(async () => {
      await result.current.controls.handleSendKey("C-c");
    });

    expect(sendKeys).not.toHaveBeenCalled();
  });

  it("reports a fallback error message when sendKeys fails", async () => {
    const sendKeys = vi.fn().mockResolvedValue({ ok: false, error: undefined });
    const { result, setScreenError } = renderControls({ sendKeys });

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(setScreenError).toHaveBeenCalledWith("Failed to send keys");
  });

  it("clears the screen error after a successful key send", async () => {
    const { result, setScreenError } = renderControls();

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(setScreenError).toHaveBeenCalledWith(null);
  });

  it("routes key sends through sendRaw with the danger flag while in raw mode, clearing the screen error on success", async () => {
    const { result, sendKeys, sendRaw, setScreenError } = renderControls();

    act(() => {
      result.current.controls.toggleRawMode();
    });

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(sendKeys).not.toHaveBeenCalled();
    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "key", value: "Enter" }], false);
    expect(setScreenError).toHaveBeenCalledWith(null);
  });

  it("sends permission shortcut digits as text and Escape as a key", async () => {
    const { result, sendRaw } = renderControls();

    await act(async () => {
      await result.current.controls.handleSendPermissionShortcut("1");
      await result.current.controls.handleSendPermissionShortcut("Escape");
    });

    expect(sendRaw).toHaveBeenNthCalledWith(1, "pane-1", [{ kind: "text", value: "1" }], false);
    expect(sendRaw).toHaveBeenNthCalledWith(2, "pane-1", [{ kind: "key", value: "Escape" }], false);
  });

  it("does not clear the screen error or fire the success callback when a permission shortcut fails", async () => {
    const sendRaw = vi.fn().mockResolvedValue({ ok: false, error: { message: "raw failed" } });
    const onSendPermissionShortcutSuccess = vi.fn();
    const { result, setScreenError } = renderControls({
      sendRaw,
      onSendPermissionShortcutSuccess,
    });

    await act(async () => {
      await result.current.controls.handleSendPermissionShortcut("1");
    });

    expect(setScreenError).toHaveBeenCalledWith("raw failed");
    expect(setScreenError).not.toHaveBeenCalledWith(null);
    expect(onSendPermissionShortcutSuccess).not.toHaveBeenCalled();
  });

  it("invokes the success callback and clears the screen error after a successful permission shortcut send", async () => {
    const onSendPermissionShortcutSuccess = vi.fn();
    const { result, setScreenError } = renderControls({ onSendPermissionShortcutSuccess });

    await act(async () => {
      await result.current.controls.handleSendPermissionShortcut("1");
    });

    expect(onSendPermissionShortcutSuccess).toHaveBeenCalledWith("pane-1");
    expect(setScreenError).toHaveBeenCalledWith(null);
  });

  it("saves auto-enter and disables it when raw mode is switched on, then restores it on switch off", () => {
    const { result } = renderControls();

    expect(result.current.autoEnter).toBe(true);

    act(() => {
      result.current.controls.toggleRawMode();
    });

    expect(result.current.rawMode).toBe(true);
    expect(result.current.autoEnter).toBe(false);

    act(() => {
      result.current.controls.toggleRawMode();
    });

    expect(result.current.rawMode).toBe(false);
    expect(result.current.autoEnter).toBe(true);
  });

  it("resets allowDangerKeys when raw mode is switched off", () => {
    const { result } = renderControls();

    act(() => {
      result.current.controls.toggleRawMode();
    });

    act(() => {
      result.current.setAllowDangerKeys(true);
    });
    expect(result.current.allowDangerKeys).toBe(true);

    act(() => {
      result.current.controls.toggleRawMode();
    });

    expect(result.current.allowDangerKeys).toBe(false);
  });
});
