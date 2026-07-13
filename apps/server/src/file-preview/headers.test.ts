import { describe, expect, it } from "vitest";

import {
  PREVIEW_CONTENT_SECURITY_POLICY,
  PREVIEW_HTML_HEADERS,
  PREVIEW_RESOURCE_HEADERS,
  buildPreviewContentSecurityPolicy,
} from "./headers";

describe("preview response headers", () => {
  it("blocks active, remote, embedding, and form capabilities in HTML", () => {
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("script-src 'none'");
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("frame-src 'none'");
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("sandbox");
    expect(PREVIEW_HTML_HEADERS["Content-Security-Policy"]).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  });

  it("disables caching and referrer propagation for every resource", () => {
    expect(PREVIEW_RESOURCE_HEADERS).toMatchObject({
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
  });

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
