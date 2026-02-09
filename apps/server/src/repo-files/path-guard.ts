import path from "node:path";

const windowsDrivePrefixPattern = /^[a-zA-Z]:[\\/]/;

const toPosixSeparators = (value: string) => value.replaceAll("\\", "/");

const stripLeadingDotSlash = (value: string) => {
  if (value.startsWith("./")) {
    return value.slice(2);
  }
  return value;
};

const isOutsideRepoRoot = (repoRoot: string, targetPath: string) => {
  const relative = path.relative(repoRoot, targetPath);
  if (relative.length === 0) {
    return false;
  }
  return relative.startsWith("..") || path.isAbsolute(relative);
};

export type PathGuardError = {
  code: "INVALID_PATH" | "FORBIDDEN_PATH";
  message: string;
};

export const isPathGuardError = (error: unknown): error is PathGuardError => {
  if (typeof error !== "object" || error == null) {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "INVALID_PATH" && candidate.code !== "FORBIDDEN_PATH") {
    return false;
  }
  return typeof candidate.message === "string";
};

const throwPathGuardError = (code: PathGuardError["code"], message: string): never => {
  throw { code, message } satisfies PathGuardError;
};

export const normalizeRepoRelativePath = (input: string | undefined) => {
  const raw = input?.trim();
  if (!raw || raw === ".") {
    return ".";
  }
  if (raw.includes("\0")) {
    throwPathGuardError("INVALID_PATH", "path must not include null bytes");
  }
  if (windowsDrivePrefixPattern.test(raw) || raw.startsWith("/")) {
    throwPathGuardError("FORBIDDEN_PATH", "path must be relative to repo root");
  }
  if (raw.includes("\\")) {
    throwPathGuardError("INVALID_PATH", "path must use POSIX separators");
  }
  const normalized = stripLeadingDotSlash(path.posix.normalize(toPosixSeparators(raw)));
  if (!normalized || normalized === ".") {
    return ".";
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throwPathGuardError("FORBIDDEN_PATH", "path must stay within repo root");
  }
  return normalized;
};

export const resolveRepoAbsolutePath = (repoRoot: string, relativePath: string) => {
  const absoluteRoot = path.resolve(repoRoot);
  const normalizedRelative = normalizeRepoRelativePath(relativePath);
  const absoluteTarget = path.resolve(
    absoluteRoot,
    normalizedRelative === "." ? "" : normalizedRelative,
  );
  if (isOutsideRepoRoot(absoluteRoot, absoluteTarget)) {
    throwPathGuardError("FORBIDDEN_PATH", "path must stay within repo root");
  }
  return absoluteTarget;
};

export const toRepoRelativePath = (repoRoot: string, absolutePath: string) => {
  const relative = path.relative(path.resolve(repoRoot), absolutePath);
  if (!relative || relative === ".") {
    return ".";
  }
  return toPosixSeparators(relative);
};
