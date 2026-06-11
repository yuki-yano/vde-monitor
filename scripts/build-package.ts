#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { execaSync } from "execa";

import { ensureShebang, findBundle } from "./bundle-utils";

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const run = (args: string[], label: string) => {
  const result = execaSync(pnpmCmd, args, { stdio: "inherit", reject: false });
  if (result.exitCode !== 0) {
    process.stderr.write(`\n[vde-monitor] ${label} failed.\n`);
    process.exit(result.exitCode ?? 1);
  }
};

const prepareBundle = (distDir: string, base: string, label: string) => {
  const bundle = findBundle(distDir, base);
  if (!bundle) {
    process.stderr.write(`\n[vde-monitor] ${label} bundle not found in dist.\n`);
    process.exit(1);
  }
  const targetPath = path.join(distDir, `${base}.js`);
  if (bundle !== targetPath) {
    fs.copyFileSync(bundle, targetPath);
  }
  ensureShebang(targetPath);
  fs.chmodSync(targetPath, 0o755);
  const duplicateMjsPath = path.join(distDir, `${base}.mjs`);
  if (bundle === duplicateMjsPath) {
    fs.rmSync(duplicateMjsPath, { force: true });
  }
};

const main = () => {
  run(["--filter", "@vde-monitor/web", "build"], "web build");
  run(["exec", "tsdown", "--config", "tsdown.config.ts"], "bundle build");

  const distDir = path.resolve("dist");
  const webDist = path.resolve("apps/web/dist");
  const targetWebDir = path.join(distDir, "web");

  if (!fs.existsSync(webDist)) {
    process.stderr.write("\n[vde-monitor] apps/web/dist not found. Did the web build fail?\n");
    process.exit(1);
  }

  fs.rmSync(targetWebDir, { recursive: true, force: true });
  fs.mkdirSync(targetWebDir, { recursive: true });
  fs.cpSync(webDist, targetWebDir, { recursive: true });

  prepareBundle(distDir, "index", "main");
  prepareBundle(distDir, "vde-monitor-hook", "hook");
};

main();
