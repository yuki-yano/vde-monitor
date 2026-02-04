import { describe, expect, it } from "vitest";

import { buildFullDir, buildPathInfo, normalizePath } from "./file-path-label-utils";

describe("file-path-label-utils", () => {
  it("normalizes backslashes", () => {
    expect(normalizePath("apps\\web\\src")).toBe("apps/web/src");
  });

  it("builds full directory path", () => {
    expect(buildFullDir("apps/web/src/index.ts")).toBe("apps/web/src");
  });

  it("builds path info with tail segments", () => {
    expect(buildPathInfo("apps/web/src/index.ts", 3)).toEqual({
      base: "index.ts",
      hint: "apps/web/src",
    });
  });
});
