import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES,
} from "./image-attachment";
import {
  authHeaders,
  createMultipartImagePayload,
  createTestContext,
} from "./api-router.test-helpers";

describe("createApiRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns REPO_UNAVAILABLE when repoRoot is missing on file tree endpoint", async () => {
    const { api } = createTestContext();
    const res = await api.request("/sessions/pane-1/files/tree", {
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("REPO_UNAVAILABLE");
  });

  it("lists tree entries and applies includeIgnoredPaths override", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-tree-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await mkdir(path.join(tmpRoot, "build"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(tmpRoot, "src", "index.ts"), "export {};\n");
      await writeFile(path.join(tmpRoot, "build", "output.txt"), "hidden\n");

      const { api, monitor, detail } = createTestContext({
        fileNavigator: {
          includeIgnoredPaths: ["build/**"],
          autoExpandMatchLimit: 100,
        },
      });
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const rootRes = await api.request("/sessions/pane-1/files/tree?limit=200", {
        headers: authHeaders,
      });
      expect(rootRes.status).toBe(200);
      const rootData = await rootRes.json();
      const rootPaths = rootData.tree.entries.map((entry: { path: string }) => entry.path);
      expect(rootPaths).toContain("src");
      expect(rootPaths).toContain("build");

      const buildRes = await api.request("/sessions/pane-1/files/tree?path=build&limit=200", {
        headers: authHeaders,
      });
      expect(buildRes.status).toBe(200);
      const buildData = await buildRes.json();
      const buildPaths = buildData.tree.entries.map((entry: { path: string }) => entry.path);
      expect(buildPaths).toContain("build/output.txt");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("searches file names with space-separated words and returns truncation metadata", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-search-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(path.join(tmpRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "beta.ts"), "export const beta = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "gamma.ts"), "export const gamma = 1;\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const firstRes = await api.request("/sessions/pane-1/files/search?q=a&limit=1", {
        headers: authHeaders,
      });
      expect(firstRes.status).toBe(200);
      const firstData = await firstRes.json();
      expect(firstData.result.query).toBe("a");
      expect(firstData.result.items.length).toBe(1);
      expect(firstData.result.totalMatchedCount).toBeGreaterThanOrEqual(2);
      expect(firstData.result.truncated).toBe(true);
      expect(typeof firstData.result.nextCursor).toBe("string");
      expect(typeof firstData.result.items[0].score).toBe("number");
      expect(Array.isArray(firstData.result.items[0].highlights)).toBe(true);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("search endpoint matches files containing all query words", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-search-words-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(path.join(tmpRoot, "src", "alpha-beta.ts"), "export const alphaBeta = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(tmpRoot, "src", "beta.ts"), "export const beta = 1;\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/search?q=alpha%20beta&limit=10", {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result.items.map((item: { path: string }) => item.path)).toEqual([
        "src/alpha-beta.ts",
      ]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("accepts file search queries longer than 200 characters", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-search-long-query-"));
    try {
      await mkdir(path.join(tmpRoot, "src"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      const longFilename = `${"a".repeat(210)}.ts`;
      await writeFile(path.join(tmpRoot, "src", longFilename), "export const long = 1;\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const query = encodeURIComponent(longFilename);
      const res = await api.request(`/sessions/pane-1/files/search?q=${query}&limit=10`, {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result.query).toBe(longFilename);
      expect(data.result.items.map((item: { path: string }) => item.path)).toContain(
        `src/${longFilename}`,
      );
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns file content with truncation metadata", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-"));
    try {
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(path.join(tmpRoot, "README.md"), "# title\nbody\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/content?path=README.md&maxBytes=5", {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.file.path).toBe("README.md");
      expect(data.file.isBinary).toBe(false);
      expect(data.file.truncated).toBe(true);
      expect(data.file.languageHint).toBe("markdown");
      expect(data.file.content).toBe("# tit");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns inline preview for supported binary image files", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-image-"));
    const imageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Zl8AAAAASUVORK5CYII=";
    try {
      await mkdir(path.join(tmpRoot, "assets"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      await writeFile(
        path.join(tmpRoot, "assets", "pixel.png"),
        Buffer.from(imageBase64, "base64"),
      );

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request(
        "/sessions/pane-1/files/content?path=assets/pixel.png&maxBytes=1024",
        {
          headers: authHeaders,
        },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.file.path).toBe("assets/pixel.png");
      expect(data.file.isBinary).toBe(true);
      expect(data.file.content).toBeNull();
      expect(data.file.imagePreview).toEqual({
        mimeType: "image/png",
        base64: imageBase64,
      });
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns FORBIDDEN_PATH when content target is ignored and not overridden", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-policy-"));
    try {
      await mkdir(path.join(tmpRoot, "build"), { recursive: true });
      await writeFile(path.join(tmpRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(tmpRoot, "build", "output.txt"), "hidden\n");

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/content?path=build/output.txt", {
        headers: authHeaders,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN_PATH");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("returns FORBIDDEN_PATH when content target is a symbolic link", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-symlink-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-files-content-outside-"));
    try {
      await writeFile(path.join(tmpRoot, ".gitignore"), "");
      const outsideFile = path.join(outsideRoot, "outside.txt");
      await writeFile(outsideFile, "outside\n");
      try {
        await symlink(outsideFile, path.join(tmpRoot, "outside-link.txt"));
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
          return;
        }
        throw error;
      }

      const { api, monitor, detail } = createTestContext();
      monitor.registry.update({
        ...detail,
        repoRoot: tmpRoot,
        currentPath: tmpRoot,
      });

      const res = await api.request("/sessions/pane-1/files/content?path=outside-link.txt", {
        headers: authHeaders,
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN_PATH");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("returns 400 when image attachment content-length is missing", async () => {
    const { api } = createTestContext();
    const payload = createMultipartImagePayload();
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
      },
      body: payload.body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("content-length header is required");
  });

  it("returns 400 when image attachment content-length is invalid", async () => {
    const { api } = createTestContext();
    const payload = createMultipartImagePayload();
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
        "x-content-length": "abc",
      },
      body: payload.body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("invalid content-length");
  });

  it("returns 400 when image attachment content-length exceeds limit", async () => {
    const { api } = createTestContext();
    const payload = createMultipartImagePayload();
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${payload.boundary}`,
        "x-content-length": String(IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES + 1),
      },
      body: payload.body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("attachment exceeds content-length limit");
  });

  it("returns 400 when image field is missing", async () => {
    const { api } = createTestContext();
    const formData = new FormData();
    formData.set(
      "file",
      new File([new TextEncoder().encode("png-data")], "sample.png", {
        type: "image/png",
      }),
    );
    const res = await api.request("/sessions/pane-1/attachments/image", {
      method: "POST",
      headers: {
        ...authHeaders,
        "x-content-length": "128",
      },
      body: formData,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_PAYLOAD");
    expect(data.error.message).toBe("image field is required");
  });

  it("stores uploaded image and returns attachment metadata", async () => {
    const { api } = createTestContext();
    const formData = new FormData();
    formData.set(
      "image",
      new File([new TextEncoder().encode("png-data")], "sample.png", {
        type: "image/png",
      }),
    );
    const originalTmpDir = process.env.TMPDIR;
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-api-router-"));
    process.env.TMPDIR = tmpRoot;

    try {
      const res = await api.request("/sessions/pane-1/attachments/image", {
        method: "POST",
        headers: {
          ...authHeaders,
          "x-content-length": "128",
        },
        body: formData,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const realTmpRoot = await realpath(tmpRoot);
      expect(data.attachment.mimeType).toBe("image/png");
      expect(data.attachment.size).toBeGreaterThan(0);
      expect(data.attachment.size).toBeLessThanOrEqual(IMAGE_ATTACHMENT_MAX_BYTES);
      expect(
        data.attachment.path.startsWith(path.join(realTmpRoot, "vde-monitor", "attachments")),
      ).toBe(true);
      expect(data.attachment.insertText).toBe(`${data.attachment.path} `);
    } finally {
      if (typeof originalTmpDir === "string") {
        process.env.TMPDIR = originalTmpDir;
      } else {
        delete process.env.TMPDIR;
      }
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("accepts a 10MB file even when multipart content-length is larger than 10MB", async () => {
    const { api } = createTestContext();
    const formData = new FormData();
    formData.set(
      "image",
      new File([new Uint8Array(IMAGE_ATTACHMENT_MAX_BYTES).fill(1)], "sample.png", {
        type: "image/png",
      }),
    );
    const simulatedContentLength = IMAGE_ATTACHMENT_MAX_BYTES + 1024;
    expect(simulatedContentLength).toBeLessThanOrEqual(IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES);

    const originalTmpDir = process.env.TMPDIR;
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-api-router-"));
    process.env.TMPDIR = tmpRoot;

    try {
      const res = await api.request("/sessions/pane-1/attachments/image", {
        method: "POST",
        headers: {
          ...authHeaders,
          "x-content-length": String(simulatedContentLength),
        },
        body: formData,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.attachment.size).toBe(IMAGE_ATTACHMENT_MAX_BYTES);
    } finally {
      if (typeof originalTmpDir === "string") {
        process.env.TMPDIR = originalTmpDir;
      } else {
        delete process.env.TMPDIR;
      }
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
