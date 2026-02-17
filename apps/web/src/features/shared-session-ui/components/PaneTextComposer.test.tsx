// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { PaneTextComposer } from "./PaneTextComposer";

describe("PaneTextComposer", () => {
  type ComposerState = Parameters<typeof PaneTextComposer>[0]["state"];
  type ComposerActions = Parameters<typeof PaneTextComposer>[0]["actions"];

  const buildState = (overrides: Partial<ComposerState> = {}): ComposerState => ({
    interactive: true,
    isSendingText: false,
    textInputRef: createRef<HTMLTextAreaElement>(),
    autoEnter: true,
    rawMode: false,
    allowDangerKeys: false,
    ...overrides,
  });

  const buildActions = (overrides: Partial<ComposerActions> = {}): ComposerActions => ({
    onSendText: vi.fn(),
    onPickImage: vi.fn(),
    onToggleAutoEnter: vi.fn(),
    onToggleRawMode: vi.fn(),
    onToggleAllowDangerKeys: vi.fn(),
    onRawBeforeInput: vi.fn(),
    onRawInput: vi.fn(),
    onRawKeyDown: vi.fn(),
    onRawCompositionStart: vi.fn(),
    onRawCompositionEnd: vi.fn(),
    ...overrides,
  });

  it("sends on ctrl/cmd + enter in normal mode", () => {
    const onSendText = vi.fn();
    render(<PaneTextComposer state={buildState()} actions={buildActions({ onSendText })} />);

    const textarea = screen.getByPlaceholderText("Type a prompt…");
    fireEvent.input(textarea, { target: { value: "echo hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onSendText).toHaveBeenCalledTimes(1);
  });

  it("does not send on ctrl/cmd + enter in raw mode", () => {
    const onSendText = vi.fn();
    render(
      <PaneTextComposer
        state={buildState({ rawMode: true })}
        actions={buildActions({ onSendText })}
      />,
    );

    const textarea = screen.getByPlaceholderText("Raw input (sent immediately)...");
    fireEvent.input(textarea, { target: { value: "echo hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onSendText).not.toHaveBeenCalled();
  });

  it("disables send button while sending", () => {
    render(
      <PaneTextComposer state={buildState({ isSendingText: true })} actions={buildActions()} />,
    );

    const sendButton = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it("expands key options when Keys button is pressed", () => {
    const onSendKey = vi.fn();
    render(
      <PaneTextComposer
        state={buildState({ keyPanel: { shiftHeld: false, ctrlHeld: false } })}
        actions={buildActions({
          keyPanel: {
            onToggleShift: vi.fn(),
            onToggleCtrl: vi.fn(),
            onSendKey,
          },
        })}
      />,
    );

    expect(screen.queryByText("Shift")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show key options" }));
    expect(screen.getByText("Shift")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(onSendKey).toHaveBeenCalledWith("Enter");
  });
});
