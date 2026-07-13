import { mkdir, mkdtemp, realpath, rename, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildPreviewResourcePath } from "./resource-url";
import { PreviewTicketService } from "./ticket-service";

const temporaryPaths: string[] = [];

const createFixture = async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vde-preview-ticket-"));
  temporaryPaths.push(temporaryRoot);
  const rootPath = path.join(temporaryRoot, "root");
  const outsidePath = path.join(temporaryRoot, "outside");
  await mkdir(path.join(rootPath, ".git"), { recursive: true });
  await mkdir(path.join(rootPath, "assets"), { recursive: true });
  await mkdir(outsidePath);
  await writeFile(path.join(rootPath, "assets", "image.png"), "image");
  await writeFile(path.join(rootPath, ".git", "config"), "secret");
  await writeFile(path.join(outsidePath, "secret.txt"), "secret");
  return {
    rootPath: await realpath(rootPath),
    outsidePath: await realpath(outsidePath),
  };
};

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })),
  );
});

describe("PreviewTicketService", () => {
  it("issues a 32-byte base64url ticket and opens only its exact entry file", async () => {
    const { rootPath } = await createFixture();
    const service = new PreviewTicketService({ randomBytes: () => new Uint8Array(32).fill(0xab) });

    const grant = service.issue([{ rootId: "repo", canonicalPath: rootPath }], {
      rootId: "repo",
      relativePath: "assets/image.png",
    });
    const opened = await service.open(grant.ticket, "repo", "assets/image.png");

    expect(grant.ticket).toBe(Buffer.alloc(32, 0xab).toString("base64url"));
    expect(opened).toMatchObject({
      absolutePath: path.join(rootPath, "assets", "image.png"),
      relativePath: "assets/image.png",
      root: { rootId: "repo", canonicalPath: rootPath },
      roots: [{ rootId: "repo", canonicalPath: rootPath }],
      size: 5,
    });
    await opened.fileHandle.close();
    await expect(service.open(grant.ticket, "repo", ".git/config")).rejects.toThrow(
      "not authorized",
    );
  });

  it("expires and revokes tickets", async () => {
    const { rootPath } = await createFixture();
    let now = 100;
    const service = new PreviewTicketService({
      now: () => now,
      randomBytes: () => new Uint8Array(32).fill(1),
      ttlMs: 50,
    });
    const roots = [{ rootId: "repo", canonicalPath: rootPath }];
    const entry = { rootId: "repo", relativePath: "assets/image.png" };
    const first = service.issue(roots, entry);
    now = 150;
    await expect(service.open(first.ticket, "repo", "assets/image.png")).rejects.toThrow(
      "invalid or expired",
    );

    now = 200;
    const second = service.issue(roots, entry);
    expect(service.revoke(second.ticket)).toBe(true);
    await expect(service.open(second.ticket, "repo", "assets/image.png")).rejects.toThrow(
      "invalid or expired",
    );

    const third = service.issue(roots, entry);
    service.revokeAll();
    await expect(service.open(third.ticket, "repo", "assets/image.png")).rejects.toThrow(
      "invalid or expired",
    );
  });

  it("authorizes only dependencies discovered from an already authorized source", async () => {
    const { rootPath } = await createFixture();
    await writeFile(path.join(rootPath, "assets", "other.png"), "other");
    const service = new PreviewTicketService({ randomBytes: () => new Uint8Array(32).fill(2) });
    const { ticket } = service.issue([{ rootId: "repo", canonicalPath: rootPath }], {
      rootId: "repo",
      relativePath: "assets/image.png",
    });

    await expect(service.open(ticket, "repo", "assets/other.png")).rejects.toThrow(
      "not authorized",
    );
    service.authorizeDependency(
      ticket,
      { rootId: "repo", relativePath: "assets/image.png" },
      { rootId: "repo", relativePath: "assets/other.png" },
    );
    const opened = await service.open(ticket, "repo", "assets/other.png");
    await opened.fileHandle.close();

    expect(() =>
      service.authorizeDependency(
        ticket,
        { rootId: "repo", relativePath: "assets/missing.css" },
        { rootId: "repo", relativePath: "assets/image.png" },
      ),
    ).toThrow("source is not authorized");
  });

  it("bounds dependency authorization work per ticket", async () => {
    const { rootPath } = await createFixture();
    await writeFile(path.join(rootPath, "assets", "first.png"), "first");
    await writeFile(path.join(rootPath, "assets", "second.png"), "second");
    const service = new PreviewTicketService({ maxDependencyAuthorizations: 1 });
    const source = { rootId: "repo", relativePath: "assets/image.png" };
    const { ticket } = service.issue([{ rootId: "repo", canonicalPath: rootPath }], source);

    service.authorizeDependency(ticket, source, {
      rootId: "repo",
      relativePath: "assets/first.png",
    });
    expect(() =>
      service.authorizeDependency(ticket, source, {
        rootId: "repo",
        relativePath: "assets/second.png",
      }),
    ).toThrow("authorization limit exceeded");
  });

  it("rejects traversal, root escape symlinks, directories, and git metadata aliases", async () => {
    const { rootPath, outsidePath } = await createFixture();
    await symlink(path.join(outsidePath, "secret.txt"), path.join(rootPath, "outside-link"));
    await symlink(path.join(rootPath, ".git", "config"), path.join(rootPath, "git-link"));
    const service = new PreviewTicketService({ randomBytes: () => new Uint8Array(32).fill(2) });
    const { ticket } = service.issue([{ rootId: "repo", canonicalPath: rootPath }], {
      rootId: "repo",
      relativePath: "assets/image.png",
    });
    const source = { rootId: "repo", relativePath: "assets/image.png" };

    expect(() =>
      service.authorizeDependency(ticket, source, {
        rootId: "repo",
        relativePath: "../outside/secret.txt",
      }),
    ).toThrow("invalid segment");
    expect(() =>
      service.authorizeDependency(ticket, source, { rootId: "repo", relativePath: "outside-link" }),
    ).toThrow("outside its authorized content boundary");
    expect(() =>
      service.authorizeDependency(ticket, source, { rootId: "repo", relativePath: "git-link" }),
    ).toThrow("outside its authorized content boundary");
    expect(() =>
      service.authorizeDependency(ticket, source, { rootId: "repo", relativePath: ".git/config" }),
    ).toThrow("outside its authorized content boundary");
    expect(() =>
      service.authorizeDependency(ticket, source, { rootId: "repo", relativePath: ".GIT/config" }),
    ).toThrow();
    expect(() =>
      service.authorizeDependency(ticket, source, { rootId: "repo", relativePath: "assets" }),
    ).toThrow("regular file");
  });

  it("rejects a file replaced after ticket issuance instead of serving the new inode", async () => {
    const { rootPath } = await createFixture();
    const imagePath = path.join(rootPath, "assets", "image.png");
    const service = new PreviewTicketService({ randomBytes: () => new Uint8Array(32).fill(3) });
    const { ticket } = service.issue([{ rootId: "repo", canonicalPath: rootPath }], {
      rootId: "repo",
      relativePath: "assets/image.png",
    });

    await rename(imagePath, path.join(rootPath, "assets", "original.png"));
    await writeFile(imagePath, "replacement");

    await expect(service.open(ticket, "repo", "assets/image.png")).rejects.toThrow(
      "changed after it was authorized",
    );
  });

  it("requires normalized absolute roots and unique safe root IDs", () => {
    const service = new PreviewTicketService();
    const entry = { rootId: "repo", relativePath: "assets/image.png" };
    expect(() =>
      service.issue([{ rootId: "repo/root", canonicalPath: "/tmp/root" }], entry),
    ).toThrow("rootId");
    expect(() => service.issue([{ rootId: "repo", canonicalPath: "relative" }], entry)).toThrow(
      "normalized absolute",
    );
    expect(() => service.issue([{ rootId: "repo", canonicalPath: "/tmp/.git" }], entry)).toThrow(
      "git metadata",
    );
    expect(() =>
      service.issue(
        [
          { rootId: "repo", canonicalPath: "/tmp/one" },
          { rootId: "repo", canonicalPath: "/tmp/two" },
        ],
        entry,
      ),
    ).toThrow("duplicate");
  });
});

describe("buildPreviewResourcePath", () => {
  it("preserves the directory shape and encodes individual path segments", () => {
    expect(buildPreviewResourcePath("ticket_1", "tmp", "nested/a b#.png")).toBe(
      "/file-preview/ticket_1/r/tmp/nested/a%20b%23.png",
    );
  });

  it("rejects traversal and unsafe identifiers", () => {
    expect(() => buildPreviewResourcePath("ticket", "tmp", "../secret")).toThrow("traversal");
    expect(() => buildPreviewResourcePath("ticket/other", "tmp", "image.png")).toThrow(
      "unsupported",
    );
  });
});
