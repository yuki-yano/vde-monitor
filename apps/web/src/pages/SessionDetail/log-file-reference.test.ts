// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  extractLogReferenceLocation,
  extractLogReferenceTokensFromLine,
  linkifyLogLineFileReferences,
  linkifyLogLineHttpUrls,
  normalizeLogReference,
} from "./log-file-reference";

describe("normalizeLogReference", () => {
  it("normalizes path token and strips line/column suffix", () => {
    expect(
      normalizeLogReference("apps/web/src/index.ts:10:2", {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "apps/web/src/index.ts",
      normalizedPath: "apps/web/src/index.ts",
      filename: "index.ts",
      kind: "path",
    });
  });

  it("normalizes filename-only token", () => {
    expect(
      normalizeLogReference("index.test.tsx", {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "index.test.tsx",
      normalizedPath: null,
      filename: "index.test.tsx",
      kind: "filename",
    });
  });

  it("ignores urls", () => {
    expect(
      normalizeLogReference("https://example.com/src/index.ts", {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "https://example.com/src/index.ts",
      normalizedPath: null,
      filename: null,
      kind: "unknown",
    });
  });

  it("strips hash style line suffix", () => {
    expect(
      normalizeLogReference("src/index.ts#L42C7", {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "src/index.ts",
      normalizedPath: "src/index.ts",
      filename: "index.ts",
      kind: "path",
    });
  });

  it("converts absolute path in repo to repo-relative path", () => {
    expect(
      normalizeLogReference("/Users/test/repo/apps/web/src/index.ts", {
        sourceRepoRoot: "/Users/test/repo",
      }),
    ).toEqual({
      display: "apps/web/src/index.ts",
      normalizedPath: "apps/web/src/index.ts",
      filename: "index.ts",
      kind: "path",
    });
  });

  it("removes quote/bracket wrappers and trailing punctuation", () => {
    expect(
      normalizeLogReference('"(./src/main.ts:12),"', {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "src/main.ts",
      normalizedPath: "src/main.ts",
      filename: "main.ts",
      kind: "path",
    });
  });

  it("normalizes tsc-style path token with (line,column)", () => {
    expect(
      normalizeLogReference("apps/web/src/main.ts(1101,29):", {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "apps/web/src/main.ts",
      normalizedPath: "apps/web/src/main.ts",
      filename: "main.ts",
      kind: "path",
    });
  });

  it("treats absolute path as path token", () => {
    expect(
      normalizeLogReference("/Users/test/repo/apps/web/src/main.ts(4,2)", {
        sourceRepoRoot: null,
      }),
    ).toEqual({
      display: "/Users/test/repo/apps/web/src/main.ts",
      normalizedPath: "/Users/test/repo/apps/web/src/main.ts",
      filename: "main.ts",
      kind: "path",
    });
  });
});

describe("linkifyLogLineFileReferences", () => {
  it("adds data-vde-file-ref on path-like and filename-like tokens", () => {
    const html = linkifyLogLineFileReferences(
      '<span class="text-red-500">error</span> at src/a.ts:3 and index.test.tsx',
    );
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const refs = Array.from(doc.querySelectorAll<HTMLElement>("[data-vde-file-ref]"));
    expect(refs.map((node) => node.dataset.vdeFileRef)).toEqual(["src/a.ts:3", "index.test.tsx"]);
    expect(refs.every((node) => node.getAttribute("role") === "button")).toBe(true);
    expect(refs.every((node) => node.getAttribute("tabindex") === "0")).toBe(true);
  });

  it("does not linkify url tokens", () => {
    const html = linkifyLogLineFileReferences("see https://example.com/index.ts for details");
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    expect(doc.querySelector("[data-vde-file-ref]")).toBeNull();
  });

  it("linkifies tsc-style token", () => {
    const html = linkifyLogLineFileReferences("apps/web/src/main.ts(1101,29): error TS2532");
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const ref = doc.querySelector<HTMLElement>("[data-vde-file-ref]");
    expect(ref?.dataset.vdeFileRef).toBe("apps/web/src/main.ts(1101,29):");
  });

  it("does not linkify filtered-out token", () => {
    const html = linkifyLogLineFileReferences("src/a.ts src/b.ts", {
      isLinkableToken: (rawToken) => rawToken === "src/b.ts",
    });
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const refs = Array.from(doc.querySelectorAll<HTMLElement>("[data-vde-file-ref]"));
    expect(refs.map((node) => node.dataset.vdeFileRef)).toEqual(["src/b.ts"]);
    expect(doc.body.textContent).toContain("src/a.ts");
  });

  it("adds active class to hovered token", () => {
    const html = linkifyLogLineFileReferences("src/a.ts src/b.ts", {
      isActiveToken: (rawToken) => rawToken === "src/b.ts",
    });
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const first = doc.querySelector<HTMLElement>("[data-vde-file-ref='src/a.ts']");
    const second = doc.querySelector<HTMLElement>("[data-vde-file-ref='src/b.ts']");
    const firstClassList = new Set((first?.className ?? "").split(/\s+/).filter(Boolean));
    const secondClassList = new Set((second?.className ?? "").split(/\s+/).filter(Boolean));
    expect(firstClassList.has("text-latte-lavender")).toBe(false);
    expect(secondClassList.has("text-latte-lavender")).toBe(true);
  });
});

describe("linkifyLogLineHttpUrls", () => {
  it("linkifies http/https tokens into anchors", () => {
    const html = linkifyLogLineHttpUrls(
      "see https://example.com/docs and http://localhost:3000/path?q=1 for details",
    );
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[data-vde-log-url]"));
    expect(links.length).toBe(2);
    expect(links[0]?.getAttribute("href")).toBe("https://example.com/docs");
    expect(links[1]?.getAttribute("href")).toBe("http://localhost:3000/path?q=1");
    expect(links.every((link) => link.getAttribute("target") === "_blank")).toBe(true);
    expect(links.every((link) => link.getAttribute("rel") === "noreferrer noopener")).toBe(true);
  });

  it("keeps trailing punctuation and wrappers outside the anchor", () => {
    const source = "visit (https://example.com/path_(x)), now.";
    const html = linkifyLogLineHttpUrls(source);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const link = doc.querySelector<HTMLAnchorElement>("a[data-vde-log-url]");
    expect(link?.textContent).toBe("https://example.com/path_(x)");
    expect(doc.body.textContent).toBe(source);
  });

  it("does not linkify non-http protocols", () => {
    const html = linkifyLogLineHttpUrls("ftp://example.com and mailto:test@example.com");
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    expect(doc.querySelector("a[data-vde-log-url]")).toBeNull();
  });

  it("does not nest anchors for existing links", () => {
    const html = linkifyLogLineHttpUrls(
      '<a href="https://example.com">https://example.com</a> and https://example.net',
    );
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    expect(doc.querySelector("a a")).toBeNull();
    expect(doc.querySelectorAll("a").length).toBe(2);
  });
});

describe("extractLogReferenceLocation", () => {
  it("extracts line/column from colon suffix", () => {
    expect(extractLogReferenceLocation("src/a.ts:12:8")).toEqual({
      line: 12,
      column: 8,
    });
  });

  it("extracts line from hash suffix", () => {
    expect(extractLogReferenceLocation("src/a.ts#L42")).toEqual({
      line: 42,
      column: null,
    });
  });

  it("extracts line/column from paren suffix", () => {
    expect(extractLogReferenceLocation("src/a.ts(1101,29):")).toEqual({
      line: 1101,
      column: 29,
    });
  });
});

describe("extractLogReferenceTokensFromLine", () => {
  it("extracts file-reference-like tokens from html line", () => {
    expect(
      extractLogReferenceTokensFromLine(
        '<span class="x">error</span> at src/a.ts:1 and index.test.tsx plus https://example.com',
      ),
    ).toEqual(["src/a.ts:1", "index.test.tsx"]);
  });
});
