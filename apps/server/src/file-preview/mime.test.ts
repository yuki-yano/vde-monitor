import { describe, expect, it } from "vitest";

import {
  isCssPreviewMimeType,
  isHtmlPreviewMimeType,
  isImagePreviewMimeType,
  resolvePreviewMimeType,
} from "./mime";

describe("preview MIME helpers", () => {
  it("maps browser image, HTML, CSS, and font extensions", () => {
    expect(resolvePreviewMimeType("IMAGE.AVIF")).toBe("image/avif");
    expect(resolvePreviewMimeType("index.html")).toBe("text/html; charset=utf-8");
    expect(resolvePreviewMimeType("style.css")).toBe("text/css; charset=utf-8");
    expect(resolvePreviewMimeType("font.woff2")).toBe("font/woff2");
    expect(resolvePreviewMimeType("unknown.bin")).toBe("application/octet-stream");
  });

  it("classifies preview response types", () => {
    expect(isHtmlPreviewMimeType("text/html; charset=utf-8")).toBe(true);
    expect(isCssPreviewMimeType("text/css; charset=utf-8")).toBe(true);
    expect(isImagePreviewMimeType("image/svg+xml")).toBe(true);
  });
});
