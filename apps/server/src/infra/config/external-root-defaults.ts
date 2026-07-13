import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ResolveDefaultExternalRootsDeps = {
  platform?: NodeJS.Platform;
  tmpdir?: () => string;
  realpath?: (targetPath: string) => string;
};

export const resolveDefaultExternalRoots = ({
  platform = os.platform(),
  tmpdir = os.tmpdir,
  realpath = fs.realpathSync.native,
}: ResolveDefaultExternalRootsDeps = {}) => {
  const candidates = [tmpdir(), ...(platform === "darwin" ? ["/tmp"] : [])];
  const roots = new Set<string>();
  for (const candidate of candidates) {
    roots.add(realpath(path.resolve(candidate)));
  }
  return [...roots];
};
