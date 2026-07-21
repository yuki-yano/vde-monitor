import type { Dirent } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";

import type { UsageTokenCounters, UsageTokenUsageResult } from "./types";

const USAGE_DAY_START_HOUR = 3;

export type CachedResult = {
  fetchedAtMs: number;
  result: UsageTokenUsageResult;
};

export type MutableModelEntry = {
  today: UsageTokenCounters;
  last30days: UsageTokenCounters;
  daily: Map<string, UsageTokenCounters>;
};

export const createEmptyUsageTokenCounters = (): UsageTokenCounters => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  totalTokens: 0,
});

export const addUsageTokenCounters = (target: UsageTokenCounters, delta: UsageTokenCounters) => {
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.cacheReadInputTokens += delta.cacheReadInputTokens;
  target.cacheCreationInputTokens += delta.cacheCreationInputTokens;
  target.totalTokens += delta.totalTokens;
};

const toUsageDayStart = (value: Date) => {
  const dayStart = new Date(value);
  dayStart.setHours(USAGE_DAY_START_HOUR, 0, 0, 0);
  if (value.getTime() < dayStart.getTime()) {
    dayStart.setDate(dayStart.getDate() - 1);
  }
  return dayStart;
};

export const toUsageDayKey = (timestampMs: number) => {
  const dayStart = toUsageDayStart(new Date(timestampMs));
  const year = dayStart.getFullYear();
  const month = String(dayStart.getMonth() + 1).padStart(2, "0");
  const day = String(dayStart.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toUsageWindowBoundaries = (now: Date) => {
  const nowMs = now.getTime();
  const todayStart = toUsageDayStart(now);
  const last30daysStart = new Date(todayStart);
  last30daysStart.setDate(last30daysStart.getDate() - 29);
  return {
    nowMs,
    todayStartMs: todayStart.getTime(),
    last30daysStartMs: last30daysStart.getTime(),
  };
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
