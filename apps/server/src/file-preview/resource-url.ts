import path from "node:path";

const resourcePrefix = "/file-preview";
const safeSegmentPattern = /^[a-zA-Z0-9_-]+$/;

const assertSafeSegment = (name: string, value: string) => {
  if (!safeSegmentPattern.test(value)) {
    throw new Error(`${name} contains unsupported characters`);
  }
};

const normalizeRelativeResourcePath = (relativePath: string) => {
  if (
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error("preview resource path must be a safe root-relative POSIX path");
  }
  const segments = relativePath.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("preview resource path must not contain empty or traversal segments");
  }
  return segments;
};

export const buildPreviewResourcePath = (ticket: string, rootId: string, relativePath: string) => {
  assertSafeSegment("ticket", ticket);
  assertSafeSegment("rootId", rootId);
  const encodedPath = normalizeRelativeResourcePath(relativePath)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${resourcePrefix}/${ticket}/r/${rootId}/${encodedPath}`;
};

export const isSafePreviewRootId = (rootId: string) => safeSegmentPattern.test(rootId);
