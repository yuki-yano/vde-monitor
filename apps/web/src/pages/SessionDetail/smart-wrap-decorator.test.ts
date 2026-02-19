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

  it("uses non-breaking gap after list marker for unknown agent", () => {
    const line =
      '- <span data-vde-file-ref="src/very/very/long/path/file.ts">src/very/very/long/path/file.ts</span>';
    const statusLine = "line 2";
    const classifications = classifySmartWrapLines([line, statusLine], "unknown");
    const [decorated] = decorateSmartWrapLines([line, statusLine], classifications);

    const document = new DOMParser().parseFromString(
      `<div>${decorated?.lineHtml}</div>`,
      "text/html",
    );
    const firstTextNode = document.body.firstElementChild?.firstChild;
    expect(firstTextNode?.textContent).toContain(`-${"\u2060\u00A0"}`);
  });

  it("keeps regular leading spaces while protecting marker gap", () => {
    const line =
      '      - <span data-vde-file-ref="apps/web/src/pages/SessionDetail/atoms/screenAtoms.test.ts:28">apps/web/src/pages/SessionDetail/atoms/screenAtoms.test.ts:28</span>';
    const statusLine = "line 2";
    const classifications = classifySmartWrapLines([line, statusLine], "unknown");
    const [decorated] = decorateSmartWrapLines([line, statusLine], classifications);

    const document = new DOMParser().parseFromString(
      `<div>${decorated?.lineHtml}</div>`,
      "text/html",
    );
    const firstTextNode = document.body.firstElementChild?.firstChild;
    expect(firstTextNode?.textContent).toContain(`      -${"\u2060\u00A0"}`);
  });

  it("uses non-breaking gap after prompt marker and does not add hanging wrapper", () => {
    const line =
      '› <span data-vde-file-ref="/private/var/folders/20/st1j3f895hl7lb5thkpbfs680000gn/T/vde-monitor/attachments/%2512/mobile-20260219-031324-86676e55.png">/private/var/folders/20/st1j3f895hl7lb5thkpbfs680000gn/T/vde-monitor/attachments/%2512/mobile-20260219-031324-86676e55.png</span>';
    const statusLine = "line 2";
    const classifications = classifySmartWrapLines([line, statusLine], "unknown");
    const [decorated] = decorateSmartWrapLines([line, statusLine], classifications);

    const document = new DOMParser().parseFromString(
      `<div>${decorated?.lineHtml}</div>`,
      "text/html",
    );
    const container = document.body.firstElementChild;
    const hangElement = document.querySelector<HTMLElement>(".vde-smart-wrap-hang");
    expect(container?.textContent).toContain("› ");
    expect(hangElement).toBeNull();
  });
});
