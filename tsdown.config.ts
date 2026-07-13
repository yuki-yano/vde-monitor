import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "tsdown";

// scripts/bundle-utils.ts と同等の同期処理。tsdown の config loader は
// ローカル TS モジュールの拡張子なし import を解決できないためここにインライン定義する。
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
    // ルート package.json の dependencies は外部化、それ以外はバンドルされる。
    // citty は意図的にルート deps へ置かずバンドルする境界なので明示する。
    alwaysBundle: ["citty"],
  },
  onSuccess: async () => {
    const distDir = path.resolve("dist");
    syncBundleJs(distDir, "index");
    syncBundleJs(distDir, "vde-monitor-hook");
  },
});
