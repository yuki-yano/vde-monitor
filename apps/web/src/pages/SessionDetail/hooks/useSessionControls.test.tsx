import { act, renderHook } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import {
  controlsAllowDangerKeysAtom,
  controlsAutoEnterAtom,
  controlsCtrlHeldAtom,
  controlsRawModeAtom,
  controlsShiftHeldAtom,
} from "../atoms/controlAtoms";
import { useSessionControls } from "./useSessionControls";

describe("useSessionControls", () => {
  const createImageFile = () =>
    new File([new Uint8Array([1, 2, 3])], "sample.png", {
      type: "image/png",
    });

  const createWrapper = () => {
    const store = createStore();
    store.set(controlsAutoEnterAtom, true);
    store.set(controlsShiftHeldAtom, false);
    store.set(controlsCtrlHeldAtom, false);
    store.set(controlsRawModeAtom, false);
    store.set(controlsAllowDangerKeysAtom, false);
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sends text with auto-enter toggle and clears input", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "echo hello";

    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleAutoEnter();
    });

    await act(async () => {
      await result.current.handleSendText();
    });

    expect(sendText).toHaveBeenCalledWith("pane-1", "echo hello", false, expect.any(String));
    expect(result.current.isSendingText).toBe(false);
    expect(textarea.value).toBe("");
    expect(scrollToBottom).toHaveBeenCalledWith("auto");
  });

  it("blocks duplicate send while a text send is in flight", async () => {
    let resolveSend: ((value: { ok: boolean }) => void) | null = null;
    const sendText = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "echo hello";
    act(() => {
      result.current.textInputRef.current = textarea;
      void result.current.handleSendText();
      void result.current.handleSendText();
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(result.current.isSendingText).toBe(true);

    await act(async () => {
      resolveSend?.({ ok: true });
      await Promise.resolve();
    });

    expect(result.current.isSendingText).toBe(false);
  });

  it("retries failed text send with the same request id", async () => {
    const sendText = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "INTERNAL", message: "Request timed out. Please retry." },
      })
      .mockResolvedValueOnce({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "echo retry";
    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleSendText();
    });
    await act(async () => {
      await result.current.handleSendText();
    });

    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls[0]?.[3]).toBeTruthy();
    expect(sendText.mock.calls[1]?.[3]).toBe(sendText.mock.calls[0]?.[3]);
    // Text send failures land on the dedicated send-error state, not the
    // shared screenError passed in from the caller.
    expect(setScreenError).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });

  it("surfaces a text send failure via the dedicated send-error state and clears it on the retried success", async () => {
    const sendText = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "INTERNAL", message: "Request timed out. Please retry." },
      })
      .mockResolvedValueOnce({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "echo retry";
    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleSendText();
    });
    expect(result.current.sendError).toBe("Request timed out. Please retry.");
    expect(setScreenError).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleSendText();
    });
    expect(result.current.sendError).toBeNull();
    expect(setScreenError).not.toHaveBeenCalled();
  });

  it("inserts uploaded image path at the current caret position", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const uploadImageAttachment = vi.fn().mockResolvedValue({
      path: "/tmp/vde-monitor/attachments/%251/mobile-20260206-000000-abcd1234.png",
      mimeType: "image/png",
      size: 3,
      createdAt: "2026-02-06T00:00:00.000Z",
      insertText: "/tmp/ignored-by-client.png ",
    });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          uploadImageAttachment,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "hello world";
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;

    act(() => {
      result.current.textInputRef.current = textarea;
    });

    const file = createImageFile();
    await act(async () => {
      await result.current.handleUploadImage(file);
    });

    const expectedPath = "/tmp/vde-monitor/attachments/%251/mobile-20260206-000000-abcd1234.png";
    expect(uploadImageAttachment).toHaveBeenCalledWith("pane-1", file);
    expect(textarea.value).toBe(`hello\n${expectedPath}\n world`);
    expect(textarea.selectionStart).toBe(textarea.selectionEnd);
    expect(textarea.selectionStart).toBe(`hello\n${expectedPath}\n`.length);
  });

  it("replaces selected prompt text with uploaded image path", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const uploadImageAttachment = vi.fn().mockResolvedValue({
      path: "/tmp/image.png",
      mimeType: "image/png",
      size: 3,
      createdAt: "2026-02-06T00:00:00.000Z",
      insertText: "/tmp/ignored-by-client.png ",
    });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          uploadImageAttachment,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "prefix target suffix";
    textarea.selectionStart = 7;
    textarea.selectionEnd = 13;

    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleUploadImage(createImageFile());
    });

    expect(textarea.value).toBe("prefix /tmp/image.png\n suffix");
    // Upload success clears the dedicated send-error state, not the shared
    // screenError passed in from the caller.
    expect(setScreenError).not.toHaveBeenCalled();
    expect(result.current.sendError).toBeNull();
  });

  it("does not prepend newline when previous character is full-width space", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const uploadImageAttachment = vi.fn().mockResolvedValue({
      path: "/tmp/image.png",
      mimeType: "image/png",
      size: 3,
      createdAt: "2026-02-06T00:00:00.000Z",
      insertText: "/tmp/ignored-by-client.png ",
    });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          uploadImageAttachment,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "hello　world";
    textarea.selectionStart = 6;
    textarea.selectionEnd = 6;

    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleUploadImage(createImageFile());
    });

    expect(textarea.value).toBe("hello　/tmp/image.png\nworld");
  });

  it("shows upload errors and keeps existing prompt text", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const uploadImageAttachment = vi.fn().mockRejectedValue(new Error("upload failed"));
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          uploadImageAttachment,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "keep this";
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleUploadImage(createImageFile());
    });

    expect(textarea.value).toBe("keep this");
    // Upload failures land on the dedicated send-error state, not the shared
    // screenError, matching ChatGridTile's handlePickImage -> composerError.
    expect(setScreenError).not.toHaveBeenCalled();
    expect(result.current.sendError).toBe("upload failed");
  });

  it("clears an upload failure's send-error after a subsequent successful send", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const uploadImageAttachment = vi.fn().mockRejectedValue(new Error("upload failed"));
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          uploadImageAttachment,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "keep this";
    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleUploadImage(createImageFile());
    });
    expect(result.current.sendError).toBe("upload failed");

    uploadImageAttachment.mockResolvedValueOnce({
      path: "/tmp/image.png",
      mimeType: "image/png",
      size: 3,
      createdAt: "2026-02-06T00:00:00.000Z",
      insertText: "/tmp/ignored-by-client.png ",
    });
    await act(async () => {
      await result.current.handleUploadImage(createImageFile());
    });

    expect(result.current.sendError).toBeNull();
    expect(setScreenError).not.toHaveBeenCalled();
  });

  it("shows fallback error when upload API is unavailable", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "keep this";
    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleUploadImage(createImageFile());
    });

    expect(textarea.value).toBe("keep this");
    expect(setScreenError).not.toHaveBeenCalled();
    expect(result.current.sendError).toBe(API_ERROR_MESSAGES.uploadImage);
  });

  it("blocks dangerous text when confirmation is canceled", async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "rm -rf /";

    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleSendText();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("maps modifier keys before sending", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    act(() => {
      result.current.toggleShift();
    });

    await act(async () => {
      await result.current.handleSendKey("Tab");
    });

    act(() => {
      result.current.toggleCtrl();
    });

    await act(async () => {
      await result.current.handleSendKey("Left");
    });

    expect(sendKeys).toHaveBeenNthCalledWith(1, "pane-1", ["BTab"]);
    expect(sendKeys).toHaveBeenNthCalledWith(2, "pane-1", ["C-Left"]);
  });

  // The success/failure error-clearing contract for handleSendKey (both raw
  // and non-raw) and handleSendPermissionShortcut, plus the digit-vs-Escape
  // sendRaw item shape, are useTerminalControls's own responsibility and are
  // covered by its unit tests (useTerminalControls.test.ts). This test only
  // asserts that useSessionControls actually wires its own paneId / sendKeys /
  // sendRaw into useTerminalControls (and routes through it for both the
  // plain-key and raw-mode paths), and that the failures/success land on the
  // dedicated send-error state rather than the shared screenError passed in
  // from the caller.
  it("wires paneId/sendKeys/sendRaw into the delegated useTerminalControls's dedicated send-error state", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "boom" } });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    act(() => {
      result.current.toggleRawMode();
    });

    await act(async () => {
      await result.current.handleSendKey("Enter");
    });

    expect(sendKeys).not.toHaveBeenCalled();
    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "key", value: "Enter" }], false);
    expect(result.current.sendError).toBe("boom");
    expect(setScreenError).not.toHaveBeenCalled();

    sendRaw.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.handleSendPermissionShortcut("Escape");
    });

    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "key", value: "Escape" }], false);
    expect(result.current.sendError).toBeNull();
    expect(setScreenError).not.toHaveBeenCalled();
  });

  it("sends raw ctrl key input from beforeinput", async () => {
    vi.useFakeTimers();
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleRawMode();
      result.current.toggleCtrl();
    });

    const preventDefault = vi.fn();
    act(() => {
      result.current.handleRawBeforeInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertText", data: "d" },
        preventDefault,
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "key", value: "C-d" }], false);
    vi.useRealTimers();
  });

  it("surfaces a raw-mode direct-typing failure via the dedicated send-error state and clears it on a subsequent successful button key send", async () => {
    vi.useFakeTimers();
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "INTERNAL", message: "raw typing failed" },
      })
      .mockResolvedValueOnce({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleRawMode();
    });

    act(() => {
      result.current.handleRawBeforeInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertText", data: "d" },
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(result.current.sendError).toBe("raw typing failed");
    expect(setScreenError).not.toHaveBeenCalled();

    // A later successful send via the key panel button (routed through
    // useTerminalControls's handleSendKey, not useRawInputHandlers) clears
    // the same send-error state — the two entry points must not diverge.
    await act(async () => {
      await result.current.handleSendKey("Enter");
    });

    expect(sendRaw).toHaveBeenLastCalledWith("pane-1", [{ kind: "key", value: "Enter" }], false);
    expect(result.current.sendError).toBeNull();
    expect(setScreenError).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("uses input fallback when beforeinput is not handled", async () => {
    vi.useFakeTimers();
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "hi";

    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleRawMode();
    });

    act(() => {
      result.current.handleRawInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertText", data: null },
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "text", value: "hi" }], false);
    vi.useRealTimers();
  });

  it("accepts replacement text input types", async () => {
    vi.useFakeTimers();
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");

    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleRawMode();
    });

    act(() => {
      result.current.handleRawBeforeInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertReplacementText", data: "？" },
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "text", value: "？" }], false);
    vi.useRealTimers();
  });

  it("falls back to input when beforeinput has no data", async () => {
    vi.useFakeTimers();
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");

    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleRawMode();
    });

    act(() => {
      result.current.handleRawBeforeInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertReplacementText", data: "" },
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    textarea.value = "?";
    act(() => {
      result.current.handleRawInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertReplacementText", data: null },
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "text", value: "?" }], false);
    vi.useRealTimers();
  });

  it("handles insertCompositionText outside composition", async () => {
    vi.useFakeTimers();
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");

    act(() => {
      result.current.textInputRef.current = textarea;
      result.current.toggleRawMode();
    });

    act(() => {
      result.current.handleRawBeforeInput({
        currentTarget: textarea,
        nativeEvent: { inputType: "insertCompositionText", data: "?" },
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(sendRaw).toHaveBeenCalledWith("pane-1", [{ kind: "text", value: "?" }], false);
    vi.useRealTimers();
  });

  it("resets prompt input mode state when pane changes", () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ paneId }: { paneId: string }) =>
        useSessionControls({
          paneId,
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      {
        wrapper,
        initialProps: { paneId: "pane-1" },
      },
    );

    act(() => {
      result.current.toggleAutoEnter();
      result.current.toggleShift();
      result.current.toggleCtrl();
      result.current.toggleRawMode();
      result.current.toggleAllowDangerKeys();
    });

    expect(result.current.autoEnter).toBe(false);
    expect(result.current.shiftHeld).toBe(true);
    expect(result.current.ctrlHeld).toBe(true);
    expect(result.current.rawMode).toBe(true);
    expect(result.current.allowDangerKeys).toBe(true);

    act(() => {
      rerender({ paneId: "pane-2" });
    });

    expect(result.current.autoEnter).toBe(true);
    expect(result.current.shiftHeld).toBe(false);
    expect(result.current.ctrlHeld).toBe(false);
    expect(result.current.rawMode).toBe(false);
    expect(result.current.allowDangerKeys).toBe(false);
  });

  it("resets the send-error state when pane changes", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: "INTERNAL", message: "boom" } });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ paneId }: { paneId: string }) =>
        useSessionControls({
          paneId,
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      {
        wrapper,
        initialProps: { paneId: "pane-1" },
      },
    );

    await act(async () => {
      await result.current.handleSendKey("Enter");
    });
    expect(result.current.sendError).toBe("boom");

    act(() => {
      rerender({ paneId: "pane-2" });
    });

    expect(result.current.sendError).toBeNull();
  });

  it("does not let a successful key/permission/text send touch the shared screenError", async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const sendRaw = vi.fn().mockResolvedValue({ ok: true });
    const setScreenError = vi.fn();
    const scrollToBottom = vi.fn();

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionControls({
          paneId: "pane-1",
          mode: "text",
          sendText,
          sendKeys,
          sendRaw,
          setScreenError,
          scrollToBottom,
        }),
      { wrapper },
    );

    const textarea = document.createElement("textarea");
    textarea.value = "echo hello";
    act(() => {
      result.current.textInputRef.current = textarea;
    });

    await act(async () => {
      await result.current.handleSendKey("Enter");
    });
    await act(async () => {
      await result.current.handleSendPermissionShortcut("Escape");
    });
    await act(async () => {
      await result.current.handleSendText();
    });

    expect(setScreenError).not.toHaveBeenCalled();
    expect(result.current.sendError).toBeNull();
  });
});
