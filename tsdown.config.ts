import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "apps/server/src/index.ts",
    "vde-monitor-hook": "packages/hooks/src/cli.ts",
  },
  format: "esm",
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  shims: false,
  inlineOnly: false,
});
