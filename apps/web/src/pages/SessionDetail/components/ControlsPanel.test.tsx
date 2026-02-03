// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ControlsPanel } from "./ControlsPanel";

describe("ControlsPanel", () => {
  it("renders read-only banner when disabled", () => {
    render(
      <ControlsPanel
        readOnly
        connected
        textInputRef={{ current: null }}
        onSendText={vi.fn()}
        autoEnter
        onToggleAutoEnter={vi.fn()}
        controlsOpen={false}
        onToggleControls={vi.fn()}
        shiftHeld={false}
        onToggleShift={vi.fn()}
        ctrlHeld={false}
        onToggleCtrl={vi.fn()}
        onSendKey={vi.fn()}
        onTouchSession={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Read-only mode is active. Interactive controls are hidden."),
    ).toBeTruthy();
  });

  it("invokes send and toggle handlers", () => {
    const onSendText = vi.fn();
    const onToggleControls = vi.fn();
    const onTouchSession = vi.fn();
    render(
      <ControlsPanel
        readOnly={false}
        connected
        textInputRef={{ current: null }}
        onSendText={onSendText}
        autoEnter
        onToggleAutoEnter={vi.fn()}
        controlsOpen={false}
        onToggleControls={onToggleControls}
        shiftHeld={false}
        onToggleShift={vi.fn()}
        ctrlHeld={false}
        onToggleCtrl={vi.fn()}
        onSendKey={vi.fn()}
        onTouchSession={onTouchSession}
      />,
    );

    fireEvent.click(screen.getByLabelText("Send"));
    expect(onSendText).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Keys"));
    expect(onToggleControls).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Pin session to top"));
    expect(onTouchSession).toHaveBeenCalled();
  });

  it("sends prompt on ctrl/meta enter", () => {
    const onSendText = vi.fn();
    render(
      <ControlsPanel
        readOnly={false}
        connected
        textInputRef={{ current: null }}
        onSendText={onSendText}
        autoEnter
        onToggleAutoEnter={vi.fn()}
        controlsOpen={false}
        onToggleControls={vi.fn()}
        shiftHeld={false}
        onToggleShift={vi.fn()}
        ctrlHeld={false}
        onToggleCtrl={vi.fn()}
        onSendKey={vi.fn()}
        onTouchSession={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("Type a prompt…");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onSendText).toHaveBeenCalledTimes(2);
  });

  it("sends keys when controls are open", () => {
    const onSendKey = vi.fn();
    const onToggleShift = vi.fn();
    const onToggleCtrl = vi.fn();
    render(
      <ControlsPanel
        readOnly={false}
        connected
        textInputRef={{ current: null }}
        onSendText={vi.fn()}
        autoEnter
        onToggleAutoEnter={vi.fn()}
        controlsOpen
        onToggleControls={vi.fn()}
        shiftHeld={false}
        onToggleShift={onToggleShift}
        ctrlHeld={false}
        onToggleCtrl={onToggleCtrl}
        onSendKey={onSendKey}
        onTouchSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Shift"));
    expect(onToggleShift).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Ctrl"));
    expect(onToggleCtrl).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Enter"));
    expect(onSendKey).toHaveBeenCalledWith("Enter");
  });
});
