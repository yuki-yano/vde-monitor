import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveDefaultExternalRoots } from "../infra/config/external-root-defaults";
import { resolveAllowedFile, resolveAllowedFileRoots } from "./allowed-file-resolver";

const tempRoots: string[] = [];

const createTempRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vde-monitor-access-"));
  tempRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("resolveAllowedFileRoots", () => {
  it("canonicalizes and deduplicates configured roots", async () => {
    const repoRoot = await createTempRoot();
    const externalRoot = await createTempRoot();
    const alias = path.join(repoRoot, "external-alias");
    await fs.symlink(externalRoot, alias);

    const result = await resolveAllowedFileRoots({
      repoRoot,
      externalRoots: [externalRoot, alias],
    });

    expect(result.roots.map((root) => root.canonicalPath)).toEqual(
      await Promise.all([repoRoot, externalRoot].map((root) => fs.realpath(root))),
    );
  });

  it("rejects external roots inside .git, including canonical aliases", async () => {
    const repoRoot = await createTempRoot();
    const gitRoot = path.join(repoRoot, ".git");
    const gitSubdirectory = path.join(gitRoot, "objects");
    const gitAlias = path.join(repoRoot, "git-root-alias");
    await fs.mkdir(gitSubdirectory, { recursive: true });
    await fs.symlink(gitRoot, gitAlias);

    for (const externalRoot of [gitRoot, gitSubdirectory, gitAlias]) {
      await expect(
        resolveAllowedFileRoots({ repoRoot, externalRoots: [externalRoot] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    }
  });
});

describe("resolveAllowedFile", () => {
  it("resolves repo-relative and allowed external absolute files", async () => {
    const repoRoot = await createTempRoot();
    const externalRoot = await createTempRoot();
    await fs.writeFile(path.join(repoRoot, "inside.txt"), "inside");
    const externalFile = path.join(externalRoot, "asset.png");
    await fs.writeFile(externalFile, "image");

    const inside = await resolveAllowedFile({
      repoRoot,
      externalRoots: [externalRoot],
      requestedPath: "inside.txt",
    });
    const external = await resolveAllowedFile({
      repoRoot,
      externalRoots: [externalRoot],
      requestedPath: externalFile,
    });

    expect(inside.repoRelativePath).toBe("inside.txt");
    expect(external.repoRelativePath).toBeNull();
    expect(external.root.canonicalPath).toBe(await fs.realpath(externalRoot));
  });

  it("rejects outside files and repo-relative symlink escapes", async () => {
    const repoRoot = await createTempRoot();
    const externalRoot = await createTempRoot();
    const outsideRoot = await createTempRoot();
    const outsideFile = path.join(outsideRoot, "outside.txt");
    await fs.writeFile(outsideFile, "outside");
    await fs.symlink(outsideFile, path.join(repoRoot, "escape.txt"));

    await expect(
      resolveAllowedFile({ repoRoot, externalRoots: [externalRoot], requestedPath: outsideFile }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    await expect(
      resolveAllowedFile({ repoRoot, externalRoots: [externalRoot], requestedPath: "escape.txt" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
  });

  it("allows internal symlink segments but rejects external-root symlink escapes", async () => {
    const repoRoot = await createTempRoot();
    const externalRoot = await createTempRoot();
    const outsideRoot = await createTempRoot();
    const internalDirectory = path.join(externalRoot, "assets");
    await fs.mkdir(internalDirectory);
    await fs.writeFile(path.join(internalDirectory, "inside.txt"), "inside");
    await fs.writeFile(path.join(outsideRoot, "outside.txt"), "outside");
    await fs.symlink(internalDirectory, path.join(externalRoot, "internal-alias"));
    await fs.symlink(outsideRoot, path.join(externalRoot, "escape-alias"));

    const internal = await resolveAllowedFile({
      repoRoot,
      externalRoots: [externalRoot],
      requestedPath: path.join(externalRoot, "internal-alias", "inside.txt"),
    });

    expect(internal.absolutePath).toBe(
      await fs.realpath(path.join(internalDirectory, "inside.txt")),
    );
    await expect(
      resolveAllowedFile({
        repoRoot,
        externalRoots: [externalRoot],
        requestedPath: path.join(externalRoot, "escape-alias", "outside.txt"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
  });

  it("rejects .git paths and symlink aliases to .git", async () => {
    const repoRoot = await createTempRoot();
    const gitRoot = path.join(repoRoot, ".git");
    await fs.mkdir(gitRoot);
    await fs.writeFile(path.join(gitRoot, "config"), "secret");
    await fs.symlink(gitRoot, path.join(repoRoot, "git-alias"));

    await expect(
      resolveAllowedFile({ repoRoot, externalRoots: [], requestedPath: ".git/config" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    await expect(
      resolveAllowedFile({ repoRoot, externalRoots: [], requestedPath: ".GIT/config" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    await expect(
      resolveAllowedFile({ repoRoot, externalRoots: [], requestedPath: "git-alias/config" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
  });

  it("does not allow repo .git through a configured external-root alias", async () => {
    const repoRoot = await createTempRoot();
    const gitRoot = path.join(repoRoot, ".git");
    const externalAlias = path.join(await createTempRoot(), "git-alias");
    await fs.mkdir(gitRoot);
    await fs.writeFile(path.join(gitRoot, "config"), "secret");
    await fs.symlink(gitRoot, externalAlias);

    await expect(
      resolveAllowedFile({
        repoRoot,
        externalRoots: [externalAlias],
        requestedPath: path.join(externalAlias, "config"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
  });

  it("rejects .git metadata and its symlink aliases inside an external root", async () => {
    const repoRoot = await createTempRoot();
    const externalRoot = await createTempRoot();
    const gitRoot = path.join(externalRoot, ".git");
    const gitAlias = path.join(externalRoot, "metadata-alias");
    await fs.mkdir(gitRoot);
    await fs.writeFile(path.join(gitRoot, "config"), "secret");
    await fs.symlink(gitRoot, gitAlias);

    for (const requestedPath of [path.join(gitRoot, "config"), path.join(gitAlias, "config")]) {
      await expect(
        resolveAllowedFile({ repoRoot, externalRoots: [externalRoot], requestedPath }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH" });
    }
  });

  it.skipIf(process.platform !== "darwin")(
    "opens both lexical and canonical macOS paths under the default temp roots",
    async () => {
      const repoRoot = await createTempRoot();
      const runtimeDirectory = await createTempRoot();
      const runtimeFile = path.join(runtimeDirectory, "runtime.txt");
      const tmpDirectory = await fs.mkdtemp("/tmp/vde-monitor-access-");
      tempRoots.push(tmpDirectory);
      const tmpFile = path.join(tmpDirectory, "tmp.txt");
      await fs.writeFile(runtimeFile, "runtime");
      await fs.writeFile(tmpFile, "tmp");
      const externalRoots = resolveDefaultExternalRoots();

      for (const requestedPath of [
        runtimeFile,
        await fs.realpath(runtimeFile),
        tmpFile,
        await fs.realpath(tmpFile),
      ]) {
        const resolved = await resolveAllowedFile({ repoRoot, externalRoots, requestedPath });
        expect(resolved.absolutePath).toBe(await fs.realpath(requestedPath));
      }
    },
  );

  it.skipIf(process.platform !== "darwin")(
    "opens both lexical and canonical forms of an explicitly configured macOS temp root",
    async () => {
      const repoRoot = await createTempRoot();
      const tmpDirectory = await fs.mkdtemp("/tmp/vde-monitor-access-explicit-");
      tempRoots.push(tmpDirectory);
      const lexicalFile = path.join(tmpDirectory, "tmp.txt");
      await fs.writeFile(lexicalFile, "tmp");
      const canonicalFile = await fs.realpath(lexicalFile);

      for (const requestedPath of [lexicalFile, canonicalFile]) {
        const resolved = await resolveAllowedFile({
          repoRoot,
          externalRoots: ["/tmp"],
          requestedPath,
        });
        expect(resolved.absolutePath).toBe(canonicalFile);
      }
    },
  );
});
