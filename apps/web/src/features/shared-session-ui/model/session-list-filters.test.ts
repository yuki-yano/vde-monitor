import { describe, expect, it } from "vitest";

import { isSessionListFilter, matchesSessionListFilter } from "./session-list-filters";

describe("session-list-filters", () => {
  it("recognizes EDITOR filter value", () => {
    expect(isSessionListFilter("EDITOR")).toBe(true);
  });

  it("matches vim and neovim commands for EDITOR filter", () => {
    expect(matchesSessionListFilter({ state: "SHELL", currentCommand: "nvim" }, "EDITOR")).toBe(
      true,
    );
    expect(
      matchesSessionListFilter(
        { state: "SHELL", currentCommand: "/opt/homebrew/bin/vim -u ~/.vimrc" },
        "EDITOR",
      ),
    ).toBe(true);
  });

  it("does not match non-editor commands for EDITOR filter", () => {
    expect(matchesSessionListFilter({ state: "SHELL", currentCommand: "bash" }, "EDITOR")).toBe(
      false,
    );
    expect(matchesSessionListFilter({ state: "RUNNING", currentCommand: null }, "EDITOR")).toBe(
      false,
    );
  });

  it("includes DONE in AGENT without adding a dedicated filter", () => {
    expect(isSessionListFilter("DONE")).toBe(false);
    expect(matchesSessionListFilter({ state: "DONE", currentCommand: null }, "AGENT")).toBe(true);
    expect(matchesSessionListFilter({ state: "SHELL", currentCommand: null }, "AGENT")).toBe(false);
  });
});
