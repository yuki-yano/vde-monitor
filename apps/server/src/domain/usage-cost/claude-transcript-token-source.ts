import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import {
  addUsageTokenCounters,
  createEmptyUsageTokenCounters,
  listJsonlFilesRecursively,
  parseFiniteNumber,
  parseIsoTimestamp,
  resolveAllowedJsonlPath,
  toUsageWindowBoundaries,
} from "./token-source-utils";
import type { UsageTokenModelEntry, UsageTokenSource, UsageTokenUsageResult } from "./types";

export type ClaudeTranscriptTokenSourceOptions = {
  projectsRootDir?: string;
  projectsRootDirs?: string[];
  cacheTtlMs?: number;
};

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_CLAUDE_CONFIG_DIR = path.join(os.homedir(), ".config", "claude");
const DEFAULT_CLAUDE_PROJECTS_ROOT = path.join(os.homedir(), ".claude", "projects");

type CachedResult = {
  fetchedAtMs: number;
  result: UsageTokenUsageResult;
};

type MutableModelEntry = {
  today: ReturnType<typeof createEmptyUsageTokenCounters>;
  last30days: ReturnType<typeof createEmptyUsageTokenCounters>;
  daily: Map<string, ReturnType<typeof createEmptyUsageTokenCounters>>;
};

const toDailyEntryList = (daily: MutableModelEntry["daily"]) =>
  Array.from(daily.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, counters]) => ({
      date,
      counters,
    }));

const toModelEntryList = (entries: Map<string, MutableModelEntry>): UsageTokenModelEntry[] => {
  const rows: UsageTokenModelEntry[] = [];
  for (const [modelId, value] of entries) {
    if (value.today.totalTokens <= 0 && value.last30days.totalTokens <= 0) {
      continue;
    }
    rows.push({
      modelId,
      today: value.today,
      last30days: value.last30days,
      daily: toDailyEntryList(value.daily),
    });
  }
  return rows;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export class ClaudeTranscriptTokenSource implements UsageTokenSource {
  private readonly projectsRootDirs: string[];
  private readonly cacheTtlMs: number;
  private cache: CachedResult | null = null;

  constructor(options: ClaudeTranscriptTokenSourceOptions = {}) {
    const providedRoots =
      options.projectsRootDirs ?? (options.projectsRootDir ? [options.projectsRootDir] : null);
    this.projectsRootDirs = providedRoots ?? [
      path.join(DEFAULT_CLAUDE_CONFIG_DIR, "projects"),
      DEFAULT_CLAUDE_PROJECTS_ROOT,
    ];
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  private parseLine = ({
    rawLine,
    todayStartMs,
    last30daysStartMs,
    entries,
    seenMessageRequests,
  }: {
    rawLine: string;
    todayStartMs: number;
    last30daysStartMs: number;
    entries: Map<string, MutableModelEntry>;
    seenMessageRequests: Set<string>;
  }) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(line) as unknown;
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") {
      return;
    }

    const record = payload as Record<string, unknown>;
    const timestampMs = parseIsoTimestamp(record.timestamp);
    if (timestampMs == null || timestampMs < last30daysStartMs) {
      return;
    }

    const message = record.message;
    if (!message || typeof message !== "object") {
      return;
    }
    const usage = (message as Record<string, unknown>).usage;
    if (!usage || typeof usage !== "object") {
      return;
    }

    const usageRecord = usage as Record<string, unknown>;
    const inputTokens = parseFiniteNumber(usageRecord.input_tokens);
    const outputTokens = parseFiniteNumber(usageRecord.output_tokens);
    const cacheReadInputTokens = parseFiniteNumber(usageRecord.cache_read_input_tokens);
    const cacheCreationInputTokens = parseFiniteNumber(usageRecord.cache_creation_input_tokens);
    const totalTokens = inputTokens + outputTokens;
    if (
      inputTokens <= 0 &&
      outputTokens <= 0 &&
      cacheReadInputTokens <= 0 &&
      cacheCreationInputTokens <= 0
    ) {
      return;
    }

    const requestId = asNonEmptyString(record.requestId);
    const messageId = asNonEmptyString((message as Record<string, unknown>).id);
    if (requestId && messageId) {
      const dedupeKey = `${messageId}:${requestId}`;
      if (seenMessageRequests.has(dedupeKey)) {
        return;
      }
      seenMessageRequests.add(dedupeKey);
    }

    const modelValue = (message as Record<string, unknown>).model;
    const modelId =
      typeof modelValue === "string" && modelValue.trim().length > 0
        ? modelValue.trim()
        : "unknown";

    const next =
      entries.get(modelId) ??
      (() => {
        const created: MutableModelEntry = {
          today: createEmptyUsageTokenCounters(),
          last30days: createEmptyUsageTokenCounters(),
          daily: new Map<string, ReturnType<typeof createEmptyUsageTokenCounters>>(),
        };
        entries.set(modelId, created);
        return created;
      })();

    const delta = {
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      totalTokens,
    };
    addUsageTokenCounters(next.last30days, delta);
    const dateKey = new Date(timestampMs).toISOString().slice(0, 10);
    const dailyCounter =
      next.daily.get(dateKey) ??
      (() => {
        const created = createEmptyUsageTokenCounters();
        next.daily.set(dateKey, created);
        return created;
      })();
    addUsageTokenCounters(dailyCounter, delta);
    if (timestampMs >= todayStartMs) {
      addUsageTokenCounters(next.today, delta);
    }
  };

  private load = async (now: Date): Promise<UsageTokenUsageResult> => {
    const nowMs = now.getTime();
    if (this.cache && nowMs - this.cache.fetchedAtMs < this.cacheTtlMs) {
      return this.cache.result;
    }

    const boundaries = toUsageWindowBoundaries(now);
    const modelEntries = new Map<string, MutableModelEntry>();
    const seenMessageRequests = new Set<string>();
    const seenFiles = new Set<string>();
    for (const projectsRootDir of this.projectsRootDirs) {
      const files = await listJsonlFilesRecursively(projectsRootDir);

      for (const filePath of files) {
        const safePath = await resolveAllowedJsonlPath({
          filePath,
          allowedRoot: projectsRootDir,
        });
        if (!safePath || seenFiles.has(safePath)) {
          continue;
        }
        seenFiles.add(safePath);

        const stream = createReadStream(safePath, { encoding: "utf8" });
        const reader = createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        for await (const line of reader) {
          this.parseLine({
            rawLine: line,
            todayStartMs: boundaries.todayStartMs,
            last30daysStartMs: boundaries.last30daysStartMs,
            entries: modelEntries,
            seenMessageRequests,
          });
        }
      }
    }

    const result: UsageTokenUsageResult = {
      ok: true,
      sourceLabel: "Claude transcript JSONL",
      updatedAt: new Date(nowMs).toISOString(),
      models: toModelEntryList(modelEntries),
    };
    this.cache = {
      fetchedAtMs: nowMs,
      result,
    };
    return result;
  };

  async getProviderTokenUsage(input: {
    providerId: "codex" | "claude";
    now: Date;
  }): Promise<UsageTokenUsageResult> {
    if (input.providerId !== "claude") {
      return {
        ok: false,
        sourceLabel: null,
        updatedAt: null,
        reasonCode: "COST_SOURCE_UNAVAILABLE",
        reasonMessage: "Claude transcript token source only supports claude provider",
      };
    }
    return this.load(input.now);
  }
}
