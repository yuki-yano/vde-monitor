import type { FileHandle } from "node:fs/promises";

export type PreviewRoot = {
  readonly rootId: string;
  readonly canonicalPath: string;
};

export type PreviewTicketGrant = {
  ticket: string;
  expiresAt: number;
};

export type PreviewTicketEntry = {
  rootId: string;
  relativePath: string;
};

export type OpenedPreviewFile = {
  absolutePath: string;
  fileHandle: FileHandle;
  relativePath: string;
  root: PreviewRoot;
  roots: readonly PreviewRoot[];
  size: number;
};

export type PreviewTransformContext = {
  authorizeResource: (rootId: string, relativePath: string) => boolean;
  ticket: string;
  roots: readonly PreviewRoot[];
  resourceRootId: string;
  resourceRelativePath: string;
};
