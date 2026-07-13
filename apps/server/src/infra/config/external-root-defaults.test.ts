import { describe, expect, it, vi } from "vitest";

import { resolveDefaultExternalRoots } from "./external-root-defaults";

describe("resolveDefaultExternalRoots", () => {
  it("includes the runtime temp directory on non-macOS platforms", () => {
    expect(
      resolveDefaultExternalRoots({
        platform: "linux",
        tmpdir: () => "/var/tmp/runtime",
        realpath: (targetPath) => targetPath,
      }),
    ).toEqual(["/var/tmp/runtime"]);
  });

  it("canonicalizes and deduplicates the macOS /tmp alias", () => {
    const realpath = vi.fn((targetPath: string) =>
      targetPath === "/tmp" ? "/private/tmp" : targetPath,
    );

    expect(
      resolveDefaultExternalRoots({
        platform: "darwin",
        tmpdir: () => "/private/tmp",
        realpath,
      }),
    ).toEqual(["/private/tmp"]);
  });

  it("keeps the per-user macOS temp directory alongside /private/tmp", () => {
    expect(
      resolveDefaultExternalRoots({
        platform: "darwin",
        tmpdir: () => "/var/folders/user/T",
        realpath: (targetPath) =>
          targetPath === "/tmp" ? "/private/tmp" : `/private${targetPath}`,
      }),
    ).toEqual(["/private/var/folders/user/T", "/private/tmp"]);
  });
});
