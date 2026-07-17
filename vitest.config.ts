import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    watch: false,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "web",
          environment: "happy-dom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
        },
      },
    ],
  },
});
