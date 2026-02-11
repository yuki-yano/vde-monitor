// @vitest-environment happy-dom
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ControlsPanel } from "./ControlsPanel";

describe("ControlsPanel", () => {
  type ControlsPanelState = Parameters<typeof ControlsPanel>[0]["state"];
  type ControlsPanelActions = Parameters<typeof ControlsPanel>[0]["actions"];

  const buildState = (overrides: Partial<ControlsPanelState> = {}): ControlsPanelState => ({
    interactive: true,
    isSendingText: false,
    textInputRef: { current: null },
    autoEnter: true,
    controlsOpen: false,
    rawMode: false,
    allowDangerKeys: false,
    shiftHeld: false,
    ctrlHeld: false,
    ...overrides,
  });

  const buildActions = (overrides: Partial<ControlsPanelActions> = {}): ControlsPanelActions => ({
    onSendText: vi.fn(),
    onPickImage: vi.fn(),
    onToggleAutoEnter: vi.fn(),
    onToggleControls: vi.fn(),
    onToggleRawMode: vi.fn(),
    onToggleAllowDangerKeys: vi.fn(),
    onToggleShift: vi.fn(),
    onToggleCtrl: vi.fn(),
    onSendKey: vi.fn(),
    onRawBeforeInput: vi.fn(),
    onRawInput: vi.fn(),
    onRawKeyDown: vi.fn(),
    onRawCompositionStart: vi.fn(),
    onRawCompositionEnd: vi.fn(),
    ...overrides,
  });

  const firePaste = (target: HTMLElement, clipboardData: Partial<DataTransfer>) => {
    const event = createEvent.paste(target, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: clipboardData,
      configurable: true,
    });
    fireEvent(target, event);
    return event;
  };

  it("invokes send and toggle handlers", () => {
    const onSendText = vi.fn();
    const onToggleControls = vi.fn();
    const state = buildState();
    const actions = buildActions({
      onSendText,
      onToggleControls,
    });
    render(<ControlsPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Send"));
    expect(onSendText).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Keys"));
    expect(onToggleControls).toHaveBeenCalled();
  });

  it("sends prompt on ctrl/meta enter", () => {
    const onSendText = vi.fn();
    const state = buildState();
    const actions = buildActions({ onSendText });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByPlaceholderText("Type a prompt…");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onSendText).toHaveBeenCalledTimes(2);
  });

  it("does not send prompt shortcut while sending", () => {
    const onSendText = vi.fn();
    const state = buildState({ isSendingText: true });
    const actions = buildActions({ onSendText });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByPlaceholderText("Type a prompt…");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onSendText).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Send") as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends keys when controls are open", () => {
    const onSendKey = vi.fn();
    const onToggleShift = vi.fn();
    const onToggleCtrl = vi.fn();
    const state = buildState({ controlsOpen: true });
    const actions = buildActions({
      onSendKey,
      onToggleShift,
      onToggleCtrl,
    });
    render(<ControlsPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByText("Shift"));
    expect(onToggleShift).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Ctrl"));
    expect(onToggleCtrl).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Enter"));
    expect(onSendKey).toHaveBeenCalledWith("Enter");
  });

  it("opens file picker and uploads selected image", () => {
    const onPickImage = vi.fn();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    const state = buildState();
    const actions = buildActions({ onPickImage });
    render(<ControlsPanel state={state} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Attach image"));
    expect(clickSpy).toHaveBeenCalled();

    const file = new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" });
    const input = screen.getByLabelText("Attach image file") as HTMLInputElement;
    expect(input.accept).toBe("image/png,image/jpeg,image/webp");
    expect(input.getAttribute("capture")).toBeNull();
    fireEvent.change(input, { target: { files: [file] } });

    expect(onPickImage).toHaveBeenCalledWith(file);
  });

  it("disables image attachment when interactive is false", () => {
    const state = buildState({ interactive: false });
    const actions = buildActions();
    render(<ControlsPanel state={state} actions={actions} />);

    const button = screen.getByLabelText("Attach image") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("uploads pasted image from clipboard items and prevents default paste", () => {
    const onPickImage = vi.fn();
    const state = buildState();
    const actions = buildActions({ onPickImage });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByRole("textbox");
    const file = new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" });
    const event = firePaste(textarea, {
      items: [
        {
          kind: "file",
          getAsFile: () => file,
        } as DataTransferItem,
      ] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });

    expect(onPickImage).toHaveBeenCalledWith(file);
    expect(event.defaultPrevented).toBe(true);
  });

  it("uploads pasted image from clipboard files fallback", () => {
    const onPickImage = vi.fn();
    const state = buildState();
    const actions = buildActions({ onPickImage });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByRole("textbox");
    const file = new File([new Uint8Array([1, 2, 3])], "sample.jpeg", { type: "image/jpeg" });
    firePaste(textarea, {
      items: [] as unknown as DataTransferItemList,
      files: [file] as unknown as FileList,
    });

    expect(onPickImage).toHaveBeenCalledWith(file);
  });

  it("does not handle pasted image when mime type is not allowed", () => {
    const onPickImage = vi.fn();
    const state = buildState();
    const actions = buildActions({ onPickImage });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByRole("textbox");
    const file = new File([new Uint8Array([1, 2, 3])], "sample.gif", { type: "image/gif" });
    const event = firePaste(textarea, {
      items: [
        {
          kind: "file",
          getAsFile: () => file,
        } as DataTransferItem,
      ] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });

    expect(onPickImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not handle non-image paste", () => {
    const onPickImage = vi.fn();
    const state = buildState();
    const actions = buildActions({ onPickImage });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByRole("textbox");
    const event = firePaste(textarea, {
      items: [
        {
          kind: "string",
          getAsFile: () => null,
        } as DataTransferItem,
      ] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });

    expect(onPickImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not handle image paste in raw mode", () => {
    const onPickImage = vi.fn();
    const state = buildState({ rawMode: true });
    const actions = buildActions({ onPickImage });
    render(<ControlsPanel state={state} actions={actions} />);

    const textarea = screen.getByRole("textbox");
    const file = new File([new Uint8Array([1, 2, 3])], "sample.webp", { type: "image/webp" });
    const event = firePaste(textarea, {
      items: [
        {
          kind: "file",
          getAsFile: () => file,
        } as DataTransferItem,
      ] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });

    expect(onPickImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
