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

export type CodexSessionTokenSourceOptions = {
  sessionsRootDir?: string;
  cacheTtlMs?: number;
};

type RawUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type MutableModelEntry = {
  today: ReturnType<typeof createEmptyUsageTokenCounters>;
  last30days: ReturnType<typeof createEmptyUsageTokenCounters>;
  daily: Map<string, ReturnType<typeof createEmptyUsageTokenCounters>>;
};

type CachedResult = {
  fetchedAtMs: number;
  result: UsageTokenUsageResult;
};

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_CODEX_SESSIONS_ROOT = path.join(os.homedir(), ".codex", "sessions");

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseUsage = (value: unknown): RawUsage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const usage = value as Record<string, unknown>;
  const inputTokens = parseFiniteNumber(usage.input_tokens);
  const cachedInputTokens = parseFiniteNumber(
    usage.cached_input_tokens ?? usage.cache_read_input_tokens,
  );
  const outputTokens = parseFiniteNumber(usage.output_tokens);
  const totalTokens = parseFiniteNumber(usage.total_tokens) || inputTokens + outputTokens;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
  };
};

const subtractUsage = (current: RawUsage, previous: RawUsage | null): RawUsage => ({
  inputTokens: Math.max(current.inputTokens - (previous?.inputTokens ?? 0), 0),
  cachedInputTokens: Math.max(current.cachedInputTokens - (previous?.cachedInputTokens ?? 0), 0),
  outputTokens: Math.max(current.outputTokens - (previous?.outputTokens ?? 0), 0),
  totalTokens: Math.max(current.totalTokens - (previous?.totalTokens ?? 0), 0),
});

const extractModelFromObject = (value: unknown): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const directModel = asNonEmptyString(record.model) ?? asNonEmptyString(record.model_name);
  if (directModel) {
    return directModel;
  }
  const info = record.info;
  if (info && typeof info === "object") {
    const infoRecord = info as Record<string, unknown>;
    const infoModel =
      asNonEmptyString(infoRecord.model) ??
      asNonEmptyString(infoRecord.model_name) ??
      extractModelFromObject(infoRecord.metadata);
    if (infoModel) {
      return infoModel;
    }
  }
  return extractModelFromObject(record.metadata);
};

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
      daily: Array.from(value.daily.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, counters]) => ({
          date,
          counters,
        })),
    });
  }
  return rows;
};

export class CodexSessionTokenSource implements UsageTokenSource {
  private readonly sessionsRootDir: string;
  private readonly cacheTtlMs: number;
  private cache: CachedResult | null = null;

  constructor(options: CodexSessionTokenSourceOptions = {}) {
    this.sessionsRootDir = options.sessionsRootDir ?? DEFAULT_CODEX_SESSIONS_ROOT;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  private load = async (now: Date): Promise<UsageTokenUsageResult> => {
    const nowMs = now.getTime();
    if (this.cache && nowMs - this.cache.fetchedAtMs < this.cacheTtlMs) {
      return this.cache.result;
    }

    const boundaries = toUsageWindowBoundaries(now);
    const modelEntries = new Map<string, MutableModelEntry>();
    const files = await listJsonlFilesRecursively(this.sessionsRootDir);

    for (const filePath of files) {
      const safePath = await resolveAllowedJsonlPath({
        filePath,
        allowedRoot: this.sessionsRootDir,
      });
      if (!safePath) {
        continue;
      }

      const stream = createReadStream(safePath, { encoding: "utf8" });
      const reader = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let currentModel = "unknown";
      let previousTotalUsage: RawUsage | null = null;

      for await (const rawLine of reader) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(line) as unknown;
        } catch {
          continue;
        }
        if (!payload || typeof payload !== "object") {
          continue;
        }
        const record = payload as Record<string, unknown>;
        const type = asNonEmptyString(record.type);
        if (type === "turn_context") {
          const nextModel = extractModelFromObject(record.payload);
          if (nextModel) {
            currentModel = nextModel;
          }
          continue;
        }
        if (type !== "event_msg") {
          continue;
        }

        const eventPayload = record.payload;
        if (!eventPayload || typeof eventPayload !== "object") {
          continue;
        }
        const eventPayloadRecord = eventPayload as Record<string, unknown>;
        if (asNonEmptyString(eventPayloadRecord.type) !== "token_count") {
          continue;
        }

        const info = eventPayloadRecord.info;
        const infoRecord =
          info && typeof info === "object" ? (info as Record<string, unknown>) : null;
        const lastUsage = parseUsage(infoRecord?.last_token_usage);
        const totalUsage = parseUsage(infoRecord?.total_token_usage);
        const rawUsage =
          lastUsage ?? (totalUsage ? subtractUsage(totalUsage, previousTotalUsage) : null);
        if (totalUsage) {
          previousTotalUsage = totalUsage;
        }
        if (!rawUsage) {
          continue;
        }
        if (
          rawUsage.inputTokens <= 0 &&
          rawUsage.cachedInputTokens <= 0 &&
          rawUsage.outputTokens <= 0 &&
          rawUsage.totalTokens <= 0
        ) {
          continue;
        }

        const timestampMs = parseIsoTimestamp(record.timestamp);
        if (timestampMs == null || timestampMs < boundaries.last30daysStartMs) {
          continue;
        }

        const modelId =
          extractModelFromObject(eventPayloadRecord) ??
          extractModelFromObject(infoRecord) ??
          currentModel;
        const modelEntry =
          modelEntries.get(modelId) ??
          (() => {
            const created: MutableModelEntry = {
              today: createEmptyUsageTokenCounters(),
              last30days: createEmptyUsageTokenCounters(),
              daily: new Map<string, ReturnType<typeof createEmptyUsageTokenCounters>>(),
            };
            modelEntries.set(modelId, created);
            return created;
          })();

        const cacheReadInputTokens = Math.min(rawUsage.cachedInputTokens, rawUsage.inputTokens);
        const delta = {
          inputTokens: rawUsage.inputTokens,
          outputTokens: rawUsage.outputTokens,
          cacheReadInputTokens,
          cacheCreationInputTokens: 0,
          totalTokens: rawUsage.totalTokens || rawUsage.inputTokens + rawUsage.outputTokens,
        };
        addUsageTokenCounters(modelEntry.last30days, delta);
        const dateKey = new Date(timestampMs).toISOString().slice(0, 10);
        const dailyCounter =
          modelEntry.daily.get(dateKey) ??
          (() => {
            const created = createEmptyUsageTokenCounters();
            modelEntry.daily.set(dateKey, created);
            return created;
          })();
        addUsageTokenCounters(dailyCounter, delta);
        if (timestampMs >= boundaries.todayStartMs) {
          addUsageTokenCounters(modelEntry.today, delta);
        }
      }
    }

    const result: UsageTokenUsageResult = {
      ok: true,
      sourceLabel: "Codex session JSONL",
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
    if (input.providerId !== "codex") {
      return {
        ok: false,
        sourceLabel: null,
        updatedAt: null,
        reasonCode: "COST_SOURCE_UNAVAILABLE",
        reasonMessage: "Codex session token source only supports codex provider",
      };
    }
    return this.load(input.now);
  }
}
