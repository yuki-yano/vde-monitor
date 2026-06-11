import fs from "node:fs";
import path from "node:path";

export const ensureShebang = (filePath: string): boolean => {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.startsWith("#!/usr/bin/env node")) {
    return false;
  }
  fs.writeFileSync(filePath, `#!/usr/bin/env node\n${content}`);
  return true;
};

export const findBundle = (dir: string, base: string): string | null => {
  const candidates = [
    path.join(dir, `${base}.mjs`),
    path.join(dir, `${base}.cjs`),
    path.join(dir, `${base}.js`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};
