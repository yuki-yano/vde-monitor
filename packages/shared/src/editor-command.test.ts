import { describe, expect, it } from "vitest";

import { isEditorCommand } from "./editor-command";

describe("isEditorCommand", () => {
  it("recognizes editor commands", () => {
    expect(isEditorCommand("nvim")).toBe(true);
    expect(isEditorCommand("/opt/homebrew/bin/neovim -u ~/.config/nvim/init.lua")).toBe(true);
    expect(isEditorCommand("gvim")).toBe(true);
    expect(isEditorCommand('nvim-qt -- --cmd "echo hi"')).toBe(true);
    expect(isEditorCommand("vimdiff a b")).toBe(true);
  });

  it("returns false for non-editor commands", () => {
    expect(isEditorCommand("bash")).toBe(false);
    expect(isEditorCommand("node script.js")).toBe(false);
    expect(isEditorCommand(null)).toBe(false);
  });
});
