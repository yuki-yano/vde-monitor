import { describe, expect, it } from "vitest";

import { resolveFileIcon } from "./file-icon-resolver";

describe("resolveFileIcon", () => {
  it("returns directory icon model", () => {
    expect(resolveFileIcon("src", "directory", true)).toEqual({
      kind: "directory",
      open: true,
    });
  });

  it("resolves extension-based icon style", () => {
    expect(resolveFileIcon("src/index.ts", "file")).toMatchObject({
      kind: "file",
      extension: "ts",
      styleKey: "ts",
    });
  });

  it("resolves extensionless known names", () => {
    expect(resolveFileIcon("README", "file")).toMatchObject({
      kind: "file",
      extension: null,
      styleKey: "md",
    });
    expect(resolveFileIcon("Dockerfile", "file")).toMatchObject({
      kind: "file",
      extension: null,
      styleKey: "docker",
    });
  });

  it("falls back to default icon for unknown extension", () => {
    expect(resolveFileIcon("notes.unknownext", "file")).toMatchObject({
      kind: "file",
      extension: "unknownext",
      styleKey: "default",
    });
  });
});
