import type { UserConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import config from "./vite.config";

describe("Vite development proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the conventional development port by default", () => {
    const resolvedConfig = config as UserConfig;

    expect(resolvedConfig.server?.port).toBe(24180);
    expect(resolvedConfig.server?.strictPort).toBe(false);
  });

  it("locks the port selected by the development orchestrator", async () => {
    vi.stubEnv("VITE_DEV_PORT", "24181");
    vi.resetModules();

    const { default: configured } = await import("./vite.config");
    const resolvedConfig = configured as UserConfig;

    expect(resolvedConfig.server?.port).toBe(24181);
    expect(resolvedConfig.server?.strictPort).toBe(true);
  });

  it("serves API and file preview requests through the same backend", () => {
    const resolvedConfig = config as UserConfig;
    const apiProxy = resolvedConfig.server?.proxy?.["/api"];
    const previewProxy = resolvedConfig.server?.proxy?.["/file-preview"];

    expect(apiProxy).toMatchObject({ target: expect.any(String), changeOrigin: true });
    expect(previewProxy).toEqual(apiProxy);
  });
});
