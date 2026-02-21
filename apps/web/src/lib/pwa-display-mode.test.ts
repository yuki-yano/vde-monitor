import { afterEach, describe, expect, it, vi } from "vitest";

import { isPwaDisplayMode, PWA_DISPLAY_MODE_QUERIES } from "./pwa-display-mode";

const originalMatchMedia = window.matchMedia;
const originalStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;

const mockMatchMedia = (matchedQueries: string[]) => {
  const mock = vi.fn((query: string) => ({
    matches: matchedQueries.includes(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: mock,
  });
};

describe("pwa-display-mode", () => {
  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      writable: true,
      value: originalStandalone,
    });
  });

  it("returns true when standalone display mode is matched", () => {
    mockMatchMedia([PWA_DISPLAY_MODE_QUERIES[0]]);
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      writable: true,
      value: false,
    });

    expect(isPwaDisplayMode()).toBe(true);
  });

  it("returns true when iOS navigator.standalone is true", () => {
    mockMatchMedia([]);
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      writable: true,
      value: true,
    });

    expect(isPwaDisplayMode()).toBe(true);
  });

  it("returns false when both display mode and standalone are unavailable", () => {
    mockMatchMedia([]);
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      writable: true,
      value: false,
    });

    expect(isPwaDisplayMode()).toBe(false);
  });
});
