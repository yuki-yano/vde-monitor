import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "tsdown";

// Equivalent to the synchronization in scripts/bundle-utils.ts. This is defined inline because the
// tsdown config loader cannot resolve extensionless imports of local TypeScript modules.
const syncBundleJs = (distDir: string, base: string) => {
  const candidates = [`${base}.mjs`, `${base}.cjs`, `${base}.js`].map((name) =>
    path.join(distDir, name),
  );
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) {
    return;
  }
  const targetPath = path.join(distDir, `${base}.js`);
  if (sourcePath !== targetPath) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  const content = fs.readFileSync(targetPath, "utf8");
  if (!content.startsWith("#!/usr/bin/env node")) {
    fs.writeFileSync(targetPath, `#!/usr/bin/env node\n${content}`);
  }
  fs.chmodSync(targetPath, 0o755);
};

export default defineConfig({
  entry: {
    index: "apps/server/src/index.ts",
    "vde-monitor-hook": "packages/hooks/src/cli.ts",
  },
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  shims: false,
  deps: {
    onlyBundle: false,
    // Dependencies in the root package.json are externalized; everything else is bundled.
    // citty intentionally stays out of the root dependencies, so mark the bundle boundary explicitly.
    alwaysBundle: ["citty"],
  },
  onSuccess: async () => {
    const distDir = path.resolve("dist");
    syncBundleJs(distDir, "index");
    syncBundleJs(distDir, "vde-monitor-hook");
  },
});
