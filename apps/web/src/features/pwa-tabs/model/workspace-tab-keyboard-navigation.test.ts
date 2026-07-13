import { describe, expect, it } from "vitest";

import { resolveWorkspaceTabNavigationIndex } from "./workspace-tab-keyboard-navigation";

describe("resolveWorkspaceTabNavigationIndex", () => {
  it("moves horizontally and wraps at both ends", () => {
    expect(
      resolveWorkspaceTabNavigationIndex({ key: "ArrowRight", currentIndex: 2, tabCount: 3 }),
    ).toBe(0);
    expect(
      resolveWorkspaceTabNavigationIndex({ key: "ArrowLeft", currentIndex: 0, tabCount: 3 }),
    ).toBe(2);
  });

  it("moves to the first or last tab with Home and End", () => {
    expect(resolveWorkspaceTabNavigationIndex({ key: "Home", currentIndex: 1, tabCount: 3 })).toBe(
      0,
    );
    expect(resolveWorkspaceTabNavigationIndex({ key: "End", currentIndex: 1, tabCount: 3 })).toBe(
      2,
    );
  });

  it("ignores navigation when the focused tab is outside the list", () => {
    expect(
      resolveWorkspaceTabNavigationIndex({ key: "ArrowRight", currentIndex: -1, tabCount: 3 }),
    ).toBeNull();
  });
});
