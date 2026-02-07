import { describe, expect, it } from "vitest";

import { resolveBackendApp } from "./macos-app";

describe("resolveBackendApp", () => {
  it("resolves terminal backend", () => {
    expect(resolveBackendApp("terminal")?.appName).toBe("Terminal");
  });

  it("resolves alacritty backend", () => {
    expect(resolveBackendApp("alacritty")?.appName).toBe("Alacritty");
  });
});
