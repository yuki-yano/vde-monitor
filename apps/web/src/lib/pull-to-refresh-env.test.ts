import { describe, expect, it } from "vitest";

import {
  type PullToRefreshEnvironment,
  isIosLikeDevice,
  isIosPwaPullToRefreshEnabled,
} from "./pull-to-refresh-env";

const buildEnvironment = (
  overrides: Partial<PullToRefreshEnvironment> = {},
): PullToRefreshEnvironment => ({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  platform: "iPhone",
  maxTouchPoints: 5,
  standalone: true,
  displayModeStandalone: true,
  ...overrides,
});

describe("pull-to-refresh-env", () => {
  it("detects iPhone user agents", () => {
    expect(
      isIosLikeDevice(
        buildEnvironment({
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          platform: "iPhone",
        }),
      ),
    ).toBe(true);
  });

  it("detects iPadOS desktop-mode user agents", () => {
    expect(
      isIosLikeDevice(
        buildEnvironment({
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
          platform: "MacIntel",
          maxTouchPoints: 5,
        }),
      ),
    ).toBe(true);
  });

  it("does not enable pull-to-refresh for non-iOS devices", () => {
    expect(
      isIosPwaPullToRefreshEnabled(
        buildEnvironment({
          userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
          platform: "Linux armv8l",
          maxTouchPoints: 5,
          standalone: true,
          displayModeStandalone: true,
        }),
      ),
    ).toBe(false);
  });

  it("requires standalone mode for iOS devices", () => {
    expect(
      isIosPwaPullToRefreshEnabled(
        buildEnvironment({
          standalone: false,
          displayModeStandalone: false,
        }),
      ),
    ).toBe(false);
  });
});
