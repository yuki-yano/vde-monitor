import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  statSync,
} from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { isSafePreviewRootId } from "./resource-url";
import type {
  OpenedPreviewFile,
  PreviewRoot,
  PreviewTicketEntry,
  PreviewTicketGrant,
} from "./types";

const DEFAULT_TICKET_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_DEPENDENCY_AUTHORIZATIONS = 1_024;

type StoredTicket = PreviewTicketGrant & {
  allowedFiles: Map<string, AuthorizedPreviewFile>;
  dependencyAuthorizationCount: number;
  roots: ReadonlyMap<string, PreviewRoot>;
};

type AuthorizedPreviewFile = {
  absolutePath: string;
  device: number;
  inode: number;
  relativePath: string;
  root: PreviewRoot;
};

type PreviewTicketServiceOptions = {
  maxDependencyAuthorizations?: number;
  now?: () => number;
  randomBytes?: (size: number) => Uint8Array;
  ttlMs?: number;
};

const isOutsideRoot = (rootPath: string, targetPath: string) => {
  const relative = path.relative(rootPath, targetPath);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
};

const normalizeRequestedRelativePath = (value: string) => {
  if (value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error("preview path must be a root-relative POSIX path");
  }
  const segments = value.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("preview path contains an invalid segment");
  }
  return segments.join(path.sep);
};

const containsGitMetadataSegment = (relativePath: string) =>
  relativePath.split(path.sep).some((segment) => segment.toLowerCase() === ".git");

const isLinkedWorktreeRoot = (root: PreviewRoot) => {
  if (root.kind !== "linked-worktree") {
    return false;
  }
  try {
    return lstatSync(path.join(root.canonicalPath, ".git")).isFile();
  } catch {
    return false;
  }
};

const toPosixPath = (value: string) => value.split(path.sep).join("/");

const buildAllowedFileKey = (rootId: string, relativePath: string) =>
  `${rootId}\0${toPosixPath(relativePath)}`;

export class PreviewTicketService {
  readonly #maxDependencyAuthorizations: number;
  readonly #now: () => number;
  readonly #randomBytes: (size: number) => Uint8Array;
  readonly #tickets = new Map<string, StoredTicket>();
  readonly #ttlMs: number;

  constructor(options: PreviewTicketServiceOptions = {}) {
    this.#maxDependencyAuthorizations =
      options.maxDependencyAuthorizations ?? DEFAULT_MAX_DEPENDENCY_AUTHORIZATIONS;
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? randomBytes;
    this.#ttlMs = options.ttlMs ?? DEFAULT_TICKET_TTL_MS;
    if (!Number.isSafeInteger(this.#ttlMs) || this.#ttlMs <= 0) {
      throw new Error("preview ticket TTL must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(this.#maxDependencyAuthorizations) ||
      this.#maxDependencyAuthorizations <= 0
    ) {
      throw new Error("preview dependency authorization limit must be a positive safe integer");
    }
  }

  issue(roots: readonly PreviewRoot[], entry: PreviewTicketEntry): PreviewTicketGrant {
    this.#deleteExpired();
    if (roots.length === 0) {
      throw new Error("preview ticket requires at least one root");
    }
    const rootMap = new Map<string, PreviewRoot>();
    for (const root of roots) {
      if (!isSafePreviewRootId(root.rootId)) {
        throw new Error("preview rootId contains unsupported characters");
      }
      if (
        !path.isAbsolute(root.canonicalPath) ||
        path.normalize(root.canonicalPath) !== root.canonicalPath ||
        (root.canonicalPath.split(path.sep).some((segment) => segment.toLowerCase() === ".git") &&
          !isLinkedWorktreeRoot(root))
      ) {
        throw new Error(
          "preview roots must be normalized absolute paths outside git metadata or linked worktree roots",
        );
      }
      if (rootMap.has(root.rootId)) {
        throw new Error(`duplicate preview rootId: ${root.rootId}`);
      }
      rootMap.set(root.rootId, { ...root });
    }

    let ticket: string;
    do {
      ticket = Buffer.from(this.#randomBytes(32)).toString("base64url");
    } while (this.#tickets.has(ticket));
    const grant = { ticket, expiresAt: this.#now() + this.#ttlMs };
    const stored = {
      ...grant,
      allowedFiles: new Map<string, AuthorizedPreviewFile>(),
      dependencyAuthorizationCount: 0,
      roots: rootMap,
    };
    const authorizedEntry = this.#resolveFile(stored, entry.rootId, entry.relativePath);
    stored.allowedFiles.set(
      buildAllowedFileKey(authorizedEntry.root.rootId, authorizedEntry.relativePath),
      authorizedEntry,
    );
    this.#tickets.set(ticket, stored);
    return grant;
  }

  authorizeDependency(ticket: string, source: PreviewTicketEntry, dependency: PreviewTicketEntry) {
    const stored = this.#getStoredTicket(ticket);
    const normalizedSourcePath = toPosixPath(normalizeRequestedRelativePath(source.relativePath));
    if (!stored.allowedFiles.has(buildAllowedFileKey(source.rootId, normalizedSourcePath))) {
      throw new Error("preview dependency source is not authorized by this ticket");
    }
    if (stored.dependencyAuthorizationCount >= this.#maxDependencyAuthorizations) {
      throw new Error("preview dependency authorization limit exceeded");
    }
    stored.dependencyAuthorizationCount += 1;
    const authorizedDependency = this.#resolveFile(
      stored,
      dependency.rootId,
      dependency.relativePath,
    );
    stored.allowedFiles.set(
      buildAllowedFileKey(authorizedDependency.root.rootId, authorizedDependency.relativePath),
      authorizedDependency,
    );
    return {
      rootId: authorizedDependency.root.rootId,
      relativePath: authorizedDependency.relativePath,
    };
  }

  async open(
    ticket: string,
    rootId: string,
    decodedRelativePath: string,
  ): Promise<OpenedPreviewFile> {
    const stored = this.#getStoredTicket(ticket);
    const normalizedRelativePath = toPosixPath(normalizeRequestedRelativePath(decodedRelativePath));
    const authorizedFile = stored.allowedFiles.get(
      buildAllowedFileKey(rootId, normalizedRelativePath),
    );
    if (!authorizedFile) {
      throw new Error("preview file is not authorized by this ticket");
    }

    const fileHandle = await fsPromises.open(
      authorizedFile.absolutePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    try {
      const openedStat = await fileHandle.stat();
      if (
        !openedStat.isFile() ||
        openedStat.dev !== authorizedFile.device ||
        openedStat.ino !== authorizedFile.inode
      ) {
        throw new Error("preview file changed after it was authorized");
      }
      return {
        absolutePath: authorizedFile.absolutePath,
        fileHandle,
        relativePath: authorizedFile.relativePath,
        root: { ...authorizedFile.root },
        roots: [...stored.roots.values()].map((root) => ({ ...root })),
        size: openedStat.size,
      };
    } catch (error) {
      await fileHandle.close();
      throw error;
    }
  }

  #resolveFile(stored: StoredTicket, rootId: string, decodedRelativePath: string) {
    const root = stored.roots.get(rootId);
    if (!root) {
      throw new Error("preview root is not authorized by this ticket");
    }
    const platformRelativePath = normalizeRequestedRelativePath(decodedRelativePath);
    const lexicalTarget = path.resolve(root.canonicalPath, platformRelativePath);
    if (isOutsideRoot(root.canonicalPath, lexicalTarget)) {
      throw new Error("preview path escapes its authorized root");
    }

    const canonicalTarget = realpathSync.native(lexicalTarget);
    const canonicalRelativePath = this.#assertTargetBoundary(root, canonicalTarget);
    const fileDescriptor = openSync(canonicalTarget, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const openedStat = fstatSync(fileDescriptor);
      if (!openedStat.isFile()) {
        throw new Error("preview target must be a regular file");
      }

      const verifiedCanonicalTarget = realpathSync.native(lexicalTarget);
      const verifiedRelativePath = this.#assertTargetBoundary(root, verifiedCanonicalTarget);
      const verifiedPathStat = statSync(verifiedCanonicalTarget);
      if (
        verifiedCanonicalTarget !== canonicalTarget ||
        verifiedRelativePath !== canonicalRelativePath ||
        !verifiedPathStat.isFile() ||
        verifiedPathStat.dev !== openedStat.dev ||
        verifiedPathStat.ino !== openedStat.ino
      ) {
        throw new Error("preview target changed while it was being authorized");
      }
      return {
        absolutePath: canonicalTarget,
        device: openedStat.dev,
        inode: openedStat.ino,
        relativePath: toPosixPath(canonicalRelativePath),
        root: { ...root },
      };
    } finally {
      closeSync(fileDescriptor);
    }
  }

  #assertTargetBoundary(root: PreviewRoot, canonicalTarget: string) {
    const canonicalRelativePath = path.relative(root.canonicalPath, canonicalTarget);
    if (
      !canonicalRelativePath ||
      isOutsideRoot(root.canonicalPath, canonicalTarget) ||
      containsGitMetadataSegment(canonicalRelativePath)
    ) {
      throw new Error("preview target is outside its authorized content boundary");
    }
    return canonicalRelativePath;
  }

  #getStoredTicket(ticket: string) {
    const stored = this.#tickets.get(ticket);
    if (!stored || stored.expiresAt <= this.#now()) {
      this.#tickets.delete(ticket);
      throw new Error("preview ticket is invalid or expired");
    }
    return stored;
  }

  revoke(ticket: string) {
    return this.#tickets.delete(ticket);
  }

  revokeAll() {
    this.#tickets.clear();
  }

  #deleteExpired() {
    const now = this.#now();
    for (const [ticket, stored] of this.#tickets) {
      if (stored.expiresAt <= now) {
        this.#tickets.delete(ticket);
      }
    }
  }
}
