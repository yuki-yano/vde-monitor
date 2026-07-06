import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TerminalHtmlLine } from "./TerminalHtmlLine";

describe("TerminalHtmlLine", () => {
  it("renders allowed terminal markup as React nodes", () => {
    render(
      <TerminalHtmlLine
        className="line"
        html='<span class="token" style="color: #d20f39; --vde-wrap-indent-ch: 7ch">error</span><br><span>next</span>'
      />,
    );

    const line = screen.getByText("error").closest(".line");
    const token = screen.getByText("error");

    expect(line).not.toBeNull();
    expect(token.classList.contains("token")).toBe(true);
    expect(token.getAttribute("style")).toContain("color: #d20f39");
    expect(token.getAttribute("style")).toContain("--vde-wrap-indent-ch: 7ch");
    expect(line?.querySelector("br")).not.toBeNull();
    expect(screen.getByText("next")).not.toBeNull();
  });

  it("drops executable markup and event attributes", () => {
    render(
      <TerminalHtmlLine html='<img src=x onerror="window.__xss = true"><script>window.__xss = true</script><style>.spoof{display:block}</style><iframe srcdoc="hi">leak</iframe><span onclick="window.__xss = true">safe</span>' />,
    );

    expect(screen.getByText("safe")).not.toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("style")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("safe").hasAttribute("onclick")).toBe(false);
    expect(document.body.textContent).not.toContain("window.__xss");
    expect(document.body.textContent).not.toContain(".spoof");
    expect(document.body.textContent).not.toContain("leak");
  });

  it("preserves vde data attributes used by screen interactions", () => {
    render(
      <TerminalHtmlLine html='<span data-vde-file-ref="src/main.ts:1">src/main.ts:1</span>' />,
    );

    expect(screen.getByText("src/main.ts:1").getAttribute("data-vde-file-ref")).toBe(
      "src/main.ts:1",
    );
  });

  it("preserves file reference keyboard and screen reader attributes", () => {
    render(
      <TerminalHtmlLine html='<span data-vde-file-ref="src/main.ts:1" role="button" tabindex="0" aria-label="Open file src/main.ts line 1">src/main.ts:1</span>' />,
    );

    const reference = screen.getByText("src/main.ts:1");
    expect(reference.getAttribute("data-vde-file-ref")).toBe("src/main.ts:1");
    expect(reference.getAttribute("role")).toBe("button");
    expect(reference.getAttribute("tabindex")).toBe("0");
    expect(reference.getAttribute("aria-label")).toBe("Open file src/main.ts line 1");
  });

  it("keeps safe links and strips unsafe link targets", () => {
    render(
      <TerminalHtmlLine html='<a href="https://example.com" target="_blank" rel="noreferrer noopener">safe</a><a href="javascript:alert(1)">bad</a>' />,
    );

    const safe = screen.getByText("safe");
    const bad = screen.getByText("bad");

    expect(safe.getAttribute("href")).toBe("https://example.com/");
    expect(safe.getAttribute("target")).toBe("_blank");
    expect(safe.getAttribute("rel")).toBe("noreferrer noopener");
    expect(bad.hasAttribute("href")).toBe(false);
  });

  it("renders terminal table col elements without children", () => {
    render(
      <TerminalHtmlLine html='<table><colgroup><col style="width:4ch; min-width:4ch;" /></colgroup><tbody><tr><td>cell</td></tr></tbody></table>' />,
    );

    const col = document.querySelector("col");

    expect(screen.getByText("cell")).not.toBeNull();
    expect(col).not.toBeNull();
    expect(col?.getAttribute("style")).toContain("width: 4ch");
  });
});
