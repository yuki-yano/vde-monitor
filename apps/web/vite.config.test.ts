import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";

import config from "./vite.config";

describe("Vite development proxy", () => {
  it("serves API and file preview requests through the same backend", () => {
    const resolvedConfig = config as UserConfig;
    const apiProxy = resolvedConfig.server?.proxy?.["/api"];
    const previewProxy = resolvedConfig.server?.proxy?.["/file-preview"];

    expect(apiProxy).toMatchObject({ target: expect.any(String), changeOrigin: true });
    expect(previewProxy).toEqual(apiProxy);
  });
});
