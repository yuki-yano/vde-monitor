import type { Dirent } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";

import type { UsageTokenCounters } from "./types";

export const createEmptyUsageTokenCounters = (): UsageTokenCounters => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  totalTokens: 0,
});

export const cloneUsageTokenCounters = (value: UsageTokenCounters): UsageTokenCounters => ({
  inputTokens: value.inputTokens,
  outputTokens: value.outputTokens,
  cacheReadInputTokens: value.cacheReadInputTokens,
  cacheCreationInputTokens: value.cacheCreationInputTokens,
  totalTokens: value.totalTokens,
});

export const addUsageTokenCounters = (target: UsageTokenCounters, delta: UsageTokenCounters) => {
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.cacheReadInputTokens += delta.cacheReadInputTokens;
  target.cacheCreationInputTokens += delta.cacheCreationInputTokens;
  target.totalTokens += delta.totalTokens;
};

export const toUsageWindowBoundaries = (now: Date) => {
  const nowMs = now.getTime();
  const todayStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const last30daysStartMs = todayStartMs - 29 * 24 * 60 * 60 * 1000;
  return {
    nowMs,
    todayStartMs,
    last30daysStartMs,
  };
};

export const parseIsoTimestamp = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const parseFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const isPathWithin = (candidatePath: string, allowedRootPath: string) =>
  candidatePath === allowedRootPath || candidatePath.startsWith(`${allowedRootPath}${path.sep}`);

export const resolveAllowedJsonlPath = async ({
  filePath,
  allowedRoot,
}: {
  filePath: string;
  allowedRoot: string;
}): Promise<string | null> => {
  if (!filePath.toLowerCase().endsWith(".jsonl")) {
    return null;
  }
  try {
    const [realRoot, realFile] = await Promise.all([realpath(allowedRoot), realpath(filePath)]);
    if (!isPathWithin(realFile, realRoot)) {
      return null;
    }
    return realFile;
  } catch {
    return null;
  }
};

export const listJsonlFilesRecursively = async (rootDir: string): Promise<string[]> => {
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }
    let entries: Dirent<string>[];
    try {
      entries = (await readdir(currentDir, {
        withFileTypes: true,
        encoding: "utf8",
      })) as Dirent<string>[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }
  return files;
};
