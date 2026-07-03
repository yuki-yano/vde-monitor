#!/usr/bin/env node
/**
 * tsgo (@typescript/native-preview) は baseUrl 指定を受け付けない
 * (TS5102: Option 'baseUrl' has been removed) ため、IDE 用の tsconfig.json
 * (baseUrl あり) と tsgo 用の tsconfig.tsgo.json (baseUrl なし・paths に
 * './' プレフィックス付き) を分離管理している。
 *
 * このスクリプトは両ファイルが「baseUrl の有無」「paths の './' プレフィックス」
 * という既知の差分以外で乖離していないことを検証する。乖離を検知したら non-zero
 * で終了し、ci で検出できるようにする。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const TSCONFIG_PATH = path.join(ROOT, "tsconfig.json");
const TSCONFIG_TSGO_PATH = path.join(ROOT, "tsconfig.tsgo.json");

type JsonRecord = Record<string, unknown>;

const stripLineComments = (source: string): string =>
  source
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");

const readJsonc = (filePath: string): JsonRecord => {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(stripLineComments(raw)) as JsonRecord;
};

const normalizePathValue = (value: string): string =>
  value.startsWith("./") ? value.slice(2) : value;

const normalizePaths = (
  paths: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined => {
  if (!paths) return paths;
  const normalized: Record<string, string[]> = {};
  for (const key of Object.keys(paths).sort()) {
    normalized[key] = [...paths[key]].map(normalizePathValue).sort();
  }
  return normalized;
};

const normalizeConfig = (config: JsonRecord): JsonRecord => {
  const compilerOptions = { ...(config.compilerOptions as JsonRecord | undefined) };
  // baseUrl はどちらか一方 (tsconfig.json) にのみ存在してよい既知の差分
  delete compilerOptions.baseUrl;
  if (compilerOptions.paths) {
    compilerOptions.paths = normalizePaths(compilerOptions.paths as Record<string, string[]>);
  }
  return {
    ...config,
    compilerOptions,
  };
};

const main = (): void => {
  const tsconfig = normalizeConfig(readJsonc(TSCONFIG_PATH));
  const tsconfigTsgo = normalizeConfig(readJsonc(TSCONFIG_TSGO_PATH));

  const actual = JSON.stringify(tsconfigTsgo, null, 2);
  const expected = JSON.stringify(tsconfig, null, 2);

  if (actual !== expected) {
    process.stderr.write(
      "[check-tsconfig-sync] tsconfig.json と tsconfig.tsgo.json が " +
        "baseUrl / paths の './' プレフィックス以外の点で乖離しています。\n\n",
    );
    process.stderr.write(`--- tsconfig.json (normalized) ---\n${expected}\n\n`);
    process.stderr.write(`--- tsconfig.tsgo.json (normalized) ---\n${actual}\n`);
    process.exit(1);
  }

  process.stdout.write(
    "[check-tsconfig-sync] tsconfig.json と tsconfig.tsgo.json は同期しています。\n",
  );
};

main();
