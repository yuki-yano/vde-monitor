#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { execa } from "execa";

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const distDir = path.resolve("dist");
const BUNDLE_SYNC_INTERVAL_MS = 500;
const bundleBases = ["index", "vde-monitor-hook", "vde-monitor-summary"] as const;

const ensureShebang = (filePath: string) => {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.startsWith("#!/usr/bin/env node")) {
    return false;
  }
  fs.writeFileSync(filePath, `#!/usr/bin/env node\n${content}`);
  return true;
};

const findBundle = (base: string): string | null => {
  const candidates = [
    path.join(distDir, `${base}.mjs`),
    path.join(distDir, `${base}.cjs`),
    path.join(distDir, `${base}.js`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const syncBundleJs = (base: string) => {
  const sourcePath = findBundle(base);
  if (!sourcePath) {
    return;
  }
  const targetPath = path.join(distDir, `${base}.js`);
  if (sourcePath !== targetPath) {
    const shouldCopy =
      !fs.existsSync(targetPath) ||
      fs.statSync(sourcePath).mtimeMs > fs.statSync(targetPath).mtimeMs ||
      fs.statSync(sourcePath).size !== fs.statSync(targetPath).size;
    if (shouldCopy) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
  const shebangUpdated = ensureShebang(targetPath);
  const mode = fs.statSync(targetPath).mode & 0o777;
  if (shebangUpdated || mode !== 0o755) {
    fs.chmodSync(targetPath, 0o755);
  }
};

const syncAllBundleJs = () => {
  fs.mkdirSync(distDir, { recursive: true });
  bundleBases.forEach((base) => {
    try {
      syncBundleJs(base);
    } catch {
      // Ignore transient errors while bundle files are being written.
    }
  });
};

const spawnPnpm = (args: string[]) =>
  execa(pnpmCmd, args, {
    stdio: "inherit",
    reject: false,
  });

const main = async () => {
  let shuttingDown = false;
  let intervalId: NodeJS.Timeout | null = null;

  const tsdownWatch = spawnPnpm(["exec", "tsdown", "--config", "tsdown.config.ts", "--watch"]);
  const webWatch = spawnPnpm([
    "--filter",
    "@vde-monitor/web",
    "build",
    "--watch",
    "--outDir",
    "../../dist/web",
    "--emptyOutDir",
  ]);

  const shutdown = (signal: "SIGINT" | "SIGTERM", exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    tsdownWatch.kill(signal);
    webWatch.kill(signal);
    process.exit(exitCode);
  };

  tsdownWatch.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown("SIGTERM", code ?? 1);
    }
  });
  webWatch.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown("SIGTERM", code ?? 1);
    }
  });

  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));

  syncAllBundleJs();
  intervalId = setInterval(syncAllBundleJs, BUNDLE_SYNC_INTERVAL_MS);

  await Promise.all([tsdownWatch, webWatch]);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
