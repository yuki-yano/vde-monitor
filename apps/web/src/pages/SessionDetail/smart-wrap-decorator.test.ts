import { describe, expect, it } from "vitest";

import { classifySmartWrapLines } from "./smart-wrap-classify";
import { decorateSmartWrapLines } from "./smart-wrap-decorator";

describe("decorateSmartWrapLines", () => {
  it("keeps linkify element structure while applying text-node smart decoration", () => {
    const line =
      '- <span data-vde-file-ref="src/very/very/long/path/file.ts">src/very/very/long/path/file.ts</span>';
    const statusLine = "43% left";
    const classifications = classifySmartWrapLines([line, statusLine], "codex");
    const [decorated] = decorateSmartWrapLines([line, statusLine], classifications);

    const document = new DOMParser().parseFromString(
      `<div>${decorated?.lineHtml}</div>`,
      "text/html",
    );
    const fileRefElement = document.querySelector<HTMLElement>("[data-vde-file-ref]");
    const hangElement = document.querySelector<HTMLElement>(".vde-smart-wrap-hang");

    expect(fileRefElement?.dataset.vdeFileRef).toBe("src/very/very/long/path/file.ts");
    expect(hangElement).not.toBeNull();
  });
});
