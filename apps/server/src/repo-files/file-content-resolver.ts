import fs from "node:fs/promises";
import path from "node:path";

import type { RepoFileContent, RepoFileLanguageHint } from "@vde-monitor/shared";

import { resolveRepoAbsolutePath } from "./path-guard";
import { createServiceError, isNotFoundError, isReadablePermissionError } from "./service-context";

const BINARY_SAMPLE_BYTES = 8_192;

const assertNoSymlinkInTargetPath = async ({
  repoRoot,
  relativePath,
}: {
  repoRoot: string;
  relativePath: string;
}) => {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return;
  }

  let currentPath = path.resolve(repoRoot);
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    let stats: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stats = await fs.lstat(currentPath);
    } catch (error) {
      if (isReadablePermissionError(error)) {
        throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
      }
      if (isNotFoundError(error)) {
        throw createServiceError("NOT_FOUND", 404, "path not found");
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw createServiceError("FORBIDDEN_PATH", 403, "path must not traverse symbolic links");
    }
  }
};

const readFileSlice = async ({
  absolutePath,
  byteLength,
}: {
  absolutePath: string;
  byteLength: number;
}) => {
  if (byteLength <= 0) {
    return Buffer.alloc(0);
  }

  let fileHandle: fs.FileHandle | null = null;
  try {
    fileHandle = await fs.open(absolutePath, "r");
    const buffer = Buffer.alloc(byteLength);
    const { bytesRead } = await fileHandle.read(buffer, 0, byteLength, 0);
    return buffer.subarray(0, bytesRead);
  } catch (error) {
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "path not found");
    }
    throw error;
  } finally {
    await fileHandle?.close();
  }
};

const isTextControlByte = (byte: number) => {
  return (byte <= 8 || (byte >= 14 && byte <= 31) || byte === 127) && byte !== 0;
};

const isBinaryContent = (sample: Buffer) => {
  if (sample.length === 0) {
    return false;
  }
  let controlByteCount = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
    if (isTextControlByte(byte)) {
      controlByteCount += 1;
    }
  }
  if (controlByteCount / sample.length >= 0.3) {
    return true;
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    // Sample bytes may end in the middle of a UTF-8 sequence.
    // `stream: true` validates complete sequences while tolerating an incomplete trailing tail.
    decoder.decode(sample, { stream: true });
    return false;
  } catch {
    return true;
  }
};

const resolveLanguageHint = (targetPath: string): RepoFileLanguageHint => {
  const normalized = targetPath.toLowerCase();
  const baseName = path.posix.basename(normalized);
  if (baseName === "dockerfile") {
    return "dockerfile";
  }
  const extension = path.posix.extname(normalized);
  if (extension === ".ts") {
    return "typescript";
  }
  if (extension === ".tsx") {
    return "tsx";
  }
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return "javascript";
  }
  if (extension === ".jsx") {
    return "jsx";
  }
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".yml" || extension === ".yaml") {
    return "yaml";
  }
  if (extension === ".sh" || extension === ".bash" || extension === ".zsh") {
    return "bash";
  }
  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }
  if (extension === ".diff" || extension === ".patch") {
    return "diff";
  }
  return "text";
};

type ResolveFileContentInput = {
  repoRoot: string;
  normalizedPath: string;
  maxBytes: number;
};

export const resolveFileContent = async ({
  repoRoot,
  normalizedPath,
  maxBytes,
}: ResolveFileContentInput): Promise<RepoFileContent> => {
  const absolutePath = resolveRepoAbsolutePath(repoRoot, normalizedPath);
  await assertNoSymlinkInTargetPath({
    repoRoot,
    relativePath: normalizedPath,
  });

  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(absolutePath);
  } catch (error) {
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "path not found");
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a file");
  }

  const sample = await readFileSlice({
    absolutePath,
    byteLength: Math.min(stats.size, BINARY_SAMPLE_BYTES),
  });
  const isBinary = isBinaryContent(sample);
  if (isBinary) {
    return {
      path: normalizedPath,
      sizeBytes: stats.size,
      isBinary: true,
      truncated: false,
      languageHint: null,
      content: null,
    } satisfies RepoFileContent;
  }

  const readBytes = Math.min(stats.size, maxBytes);
  const fileBuffer = await readFileSlice({
    absolutePath,
    byteLength: readBytes,
  });

  return {
    path: normalizedPath,
    sizeBytes: stats.size,
    isBinary: false,
    truncated: stats.size > maxBytes,
    languageHint: resolveLanguageHint(normalizedPath),
    content: fileBuffer.toString("utf8"),
  } satisfies RepoFileContent;
};
