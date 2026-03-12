import { describe, expect, it } from "vitest";

import { isMainModule } from "./main-module";

describe("isMainModule", () => {
  it("returns true when moduleUrl matches the entrypoint path", () => {
    expect(
      isMainModule(
        "file:///Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor/dist/vde-monitor-hook.js",
        "/Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor/dist/vde-monitor-hook.js",
      ),
    ).toBe(true);
  });

  it("returns false when imported helper moduleUrl is used for a different entrypoint", () => {
    expect(
      isMainModule(
        "file:///Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor/dist/cli-ySbDmZGw.mjs",
        "/Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor/dist/vde-monitor-hook.js",
      ),
    ).toBe(false);
  });
});
