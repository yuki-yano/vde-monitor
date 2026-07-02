export const parseAgentOptions = (value: string) =>
  value.split(/\r?\n/).filter((line) => line.trim().length > 0);

export const normalizePathForDisplay = (value: string) =>
  value.replace(/[\\/]+$/g, "").replace(/\\/g, "/");

export const toRepoRelativePath = (targetPath: string, repoRoot: string | null) => {
  const normalizedTarget = normalizePathForDisplay(targetPath);
  if (!repoRoot) {
    return normalizedTarget;
  }
  const normalizedRoot = normalizePathForDisplay(repoRoot);
  if (!normalizedRoot) {
    return normalizedTarget;
  }
  if (normalizedTarget === normalizedRoot) {
    return ".";
  }
  const prefix = `${normalizedRoot}/`;
  if (normalizedTarget.startsWith(prefix)) {
    return normalizedTarget.slice(prefix.length);
  }
  return normalizedTarget;
};
