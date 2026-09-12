import { describe, expect, it } from "vitest";

import { buildPreviewContentSecurityPolicy } from "./headers";

describe("preview response headers", () => {
  it("allows configured web origins to embed the sandboxed HTML", () => {
    expect(
      buildPreviewContentSecurityPolicy([
        "https://monitor.example/path",
        "https://monitor.example",
        "not-an-origin",
      ]),
    ).toContain("frame-ancestors 'self' https://monitor.example");
  });
});
