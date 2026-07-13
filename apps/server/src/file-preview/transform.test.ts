import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreviewTransformContext } from "./types";
import { rewritePreviewResourceUrl, transformPreviewCss, transformPreviewHtml } from "./transform";

let temporaryRoot: string;
let context: PreviewTransformContext;

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vde-preview-transform-"));
  await mkdir(path.join(temporaryRoot, "assets", "fonts"), { recursive: true });
  await mkdir(path.join(temporaryRoot, "pages"), { recursive: true });
  await writeFile(path.join(temporaryRoot, "assets", "image.png"), "image");
  await writeFile(path.join(temporaryRoot, "assets", "icon.svg"), "icon");
  await writeFile(path.join(temporaryRoot, "assets", "import.css"), "body {}");
  await writeFile(path.join(temporaryRoot, "assets", "fonts", "font.woff2"), "font");
  await writeFile(path.join(temporaryRoot, "pages", "relative.css"), "body {}");
  await writeFile(path.join(temporaryRoot, "pages", "relative.png"), "image");
  await writeFile(path.join(temporaryRoot, "pages", "relative@2x.png"), "image");
  temporaryRoot = await realpath(temporaryRoot);
  context = {
    authorizeResource: vi.fn(() => true),
    ticket: "ticket_1",
    roots: [{ rootId: "repo", canonicalPath: temporaryRoot }],
    resourceRootId: "repo",
    resourceRelativePath: "pages/index.html",
  };
});

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("rewritePreviewResourceUrl", () => {
  it("authorizes relative references while keeping fragment, data, and blob references", () => {
    expect(rewritePreviewResourceUrl("../assets/image.png", context)).toBe(
      "/file-preview/ticket_1/r/repo/assets/image.png",
    );
    expect(rewritePreviewResourceUrl("#icon", context)).toBe("#icon");
    expect(rewritePreviewResourceUrl("data:image/png;base64,AA==", context)).toBe(
      "data:image/png;base64,AA==",
    );
    expect(rewritePreviewResourceUrl("blob:https://localhost/id", context)).toBe(
      "blob:https://localhost/id",
    );
  });

  it("maps allowed filesystem absolute and file URLs into the ticket namespace", () => {
    const imagePath = path.join(temporaryRoot, "assets", "image.png");
    expect(rewritePreviewResourceUrl(imagePath, context)).toBe(
      "/file-preview/ticket_1/r/repo/assets/image.png",
    );
    expect(rewritePreviewResourceUrl(pathToFileURL(imagePath).href, context)).toBe(
      "/file-preview/ticket_1/r/repo/assets/image.png",
    );
  });

  it("disables remote, unsupported-scheme, missing, and outside-root references", () => {
    expect(rewritePreviewResourceUrl("https://example.com/a.png", context)).toBe("about:blank");
    expect(rewritePreviewResourceUrl("//example.com/a.png", context)).toBe("about:blank");
    expect(rewritePreviewResourceUrl("javascript:alert(1)", context)).toBe("about:blank");
    expect(rewritePreviewResourceUrl("/does/not/exist.png", context)).toBe("about:blank");
  });

  it("disables git metadata references regardless of path casing", async () => {
    await mkdir(path.join(temporaryRoot, ".git"));
    await writeFile(path.join(temporaryRoot, ".git", "secret.svg"), "secret");

    expect(rewritePreviewResourceUrl(path.join(temporaryRoot, ".GIT", "secret.svg"), context)).toBe(
      "about:blank",
    );
  });
});

describe("transformPreviewCss", () => {
  it("rewrites and authorizes relative and absolute url() and @import references", () => {
    const imagePath = path.join(temporaryRoot, "assets", "image.png");
    const importPath = path.join(temporaryRoot, "assets", "import.css");
    const fontUrl = pathToFileURL(path.join(temporaryRoot, "assets", "fonts", "font.woff2")).href;
    const result = transformPreviewCss(
      [
        `@import "${importPath}";`,
        '@import "relative.css";',
        `.hero { background: url("${imagePath}"); mask: url(https://example.com/mask.svg); }`,
        `.icon { background: url(../assets/icon.svg); }`,
        `@font-face { src: url("${fontUrl}") format("woff2"); }`,
      ].join("\n"),
      context,
    );

    expect(result).toContain('@import "/file-preview/ticket_1/r/repo/assets/import.css";');
    expect(result).toContain('@import "/file-preview/ticket_1/r/repo/pages/relative.css";');
    expect(result).toContain('url("/file-preview/ticket_1/r/repo/assets/image.png")');
    expect(result).toContain('url("about:blank")');
    expect(result).toContain('url("/file-preview/ticket_1/r/repo/assets/icon.svg")');
    expect(result).toContain(
      'url("/file-preview/ticket_1/r/repo/assets/fonts/font.woff2") format("woff2")',
    );
  });
});

describe("transformPreviewHtml", () => {
  it("rewrites image, source, stylesheet, poster, and inline CSS references", () => {
    const imagePath = path.join(temporaryRoot, "assets", "image.png");
    const cssPath = path.join(temporaryRoot, "assets", "import.css");
    const fileUrl = pathToFileURL(imagePath).href;
    const result = transformPreviewHtml(
      `<!doctype html><html><head>
        <link rel="stylesheet alternate" href="${cssPath}">
        <style>.hero { background-image: url(${fileUrl}) }</style>
      </head><body style="background: url('${imagePath}')">
        <picture><source src="${fileUrl}" srcset="${imagePath} 1x, relative@2x.png 2x"></picture>
        <img src="https://example.com/a.png" srcset="//example.com/a.png 1x, relative.png 2x">
        <video poster="${imagePath}"></video>
      </body></html>`,
      context,
    );

    expect(result).toContain('href="/file-preview/ticket_1/r/repo/assets/import.css"');
    expect(result).toContain('src="/file-preview/ticket_1/r/repo/assets/image.png"');
    expect(result).toContain(
      'srcset="/file-preview/ticket_1/r/repo/assets/image.png 1x, /file-preview/ticket_1/r/repo/pages/relative%402x.png 2x"',
    );
    expect(result).toContain('src="about:blank"');
    expect(result).toContain(
      'srcset="about:blank 1x, /file-preview/ticket_1/r/repo/pages/relative.png 2x"',
    );
    expect(result).toContain('poster="/file-preview/ticket_1/r/repo/assets/image.png"');
    expect(result.match(/\/file-preview\/ticket_1\/r\/repo\/assets\/image\.png/g)?.length).toBe(5);
  });
});
