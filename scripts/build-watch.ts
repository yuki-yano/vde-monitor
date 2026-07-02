#!/usr/bin/env node
import { execa } from "execa";

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const spawnPnpm = (args: string[]) =>
  execa(pnpmCmd, args, {
    stdio: "inherit",
    reject: false,
  });

const main = async () => {
  let shuttingDown = false;

  // バンドルの .js 同期（shebang 付与・chmod 755）は tsdown.config.ts の onSuccess が
  // 各ビルド成功時に行うため、このスクリプトはプロセス管理のみを担当する。
  const tsdownWatch = spawnPnpm(["exec", "tsdown", "--config", "tsdown.config.ts", "--watch"]);
  const webWatch = spawnPnpm([
    "--filter",
    "@vde-monitor/web",
    "exec",
    "vite",
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

  await Promise.all([tsdownWatch, webWatch]);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
