import { describe, expect, it } from "vitest";

import { resolveRawKeyInput } from "./raw-input-keymap";

describe("resolveRawKeyInput", () => {
  it("maps tab with shift to BTab", () => {
    expect(resolveRawKeyInput({ key: "Tab", ctrlActive: false, shiftActive: true })).toEqual({
      key: "BTab",
    });
  });

  it("maps ctrl+enter to C-Enter", () => {
    expect(resolveRawKeyInput({ key: "Enter", ctrlActive: true, shiftActive: false })).toEqual({
      key: "C-Enter",
    });
  });

  it("maps ctrl+arrow to ctrl arrow key", () => {
    expect(resolveRawKeyInput({ key: "ArrowUp", ctrlActive: true, shiftActive: false })).toEqual({
      key: "C-Up",
    });
  });

  it("maps function keys as-is", () => {
    expect(resolveRawKeyInput({ key: "F12", ctrlActive: false, shiftActive: false })).toEqual({
      key: "F12",
    });
  });

  it("maps ctrl+letter and marks beforeinput suppression", () => {
    expect(resolveRawKeyInput({ key: "A", ctrlActive: true, shiftActive: false })).toEqual({
      key: "C-a",
      suppressBeforeInput: true,
    });
  });

  it("returns null for unsupported keys", () => {
    expect(resolveRawKeyInput({ key: "Meta", ctrlActive: false, shiftActive: false })).toBeNull();
  });
});
