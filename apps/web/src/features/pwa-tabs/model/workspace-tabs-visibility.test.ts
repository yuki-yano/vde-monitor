import { describe, expect, it } from "vitest";

import { resolveWorkspaceTabsEnabled } from "./workspace-tabs-visibility";

describe("resolveWorkspaceTabsEnabled", () => {
  it("enables tabs in all mode on mobile viewport", () => {
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "all",
        pwaDisplayMode: true,
        mobileViewport: true,
      }),
    ).toBe(true);
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "all",
        pwaDisplayMode: false,
        mobileViewport: true,
      }),
    ).toBe(true);
  });

  it("enables tabs only in pwa mode when display mode is pwa and viewport is mobile", () => {
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "pwa",
        pwaDisplayMode: true,
        mobileViewport: true,
      }),
    ).toBe(true);
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "pwa",
        pwaDisplayMode: false,
        mobileViewport: true,
      }),
    ).toBe(false);
  });

  it("disables tabs in none mode", () => {
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "none",
        pwaDisplayMode: true,
        mobileViewport: true,
      }),
    ).toBe(false);
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "none",
        pwaDisplayMode: false,
        mobileViewport: true,
      }),
    ).toBe(false);
  });

  it("disables tabs on non-mobile viewport regardless of display mode", () => {
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "all",
        pwaDisplayMode: true,
        mobileViewport: false,
      }),
    ).toBe(false);
    expect(
      resolveWorkspaceTabsEnabled({
        displayMode: "pwa",
        pwaDisplayMode: true,
        mobileViewport: false,
      }),
    ).toBe(false);
  });
});
