import { describe, expect, it } from "vitest";

import { isSessionListFilter, matchesSessionListFilter } from "./sessionListFilters";

describe("sessionListFilters", () => {
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
});
