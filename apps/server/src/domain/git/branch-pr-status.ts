import { execa } from "execa";

import type { BranchPrInfo } from "@vde-monitor/shared";

const PR_CACHE_TTL_MS = 60_000;
const GH_TIMEOUT_MS = 8000;

const prCache = new Map<string, { at: number; map: Map<string, BranchPrInfo> | null }>();
const inflight = new Map<string, Promise<Map<string, BranchPrInfo> | null>>();

const PR_STATE_PRIORITY: Record<BranchPrInfo["state"], number> = {
  open: 0,
  merged: 1,
  closed_unmerged: 2,
  none: 3,
};

const toPrState = (value: unknown): BranchPrInfo["state"] | null => {
  if (value === "OPEN") {
    return "open";
  }
  if (value === "MERGED") {
    return "merged";
  }
  if (value === "CLOSED") {
    return "closed_unmerged";
  }
  return null;
};

export const parseGhPrListOutput = (raw: string): Map<string, BranchPrInfo> => {
  const map = new Map<string, BranchPrInfo>();
  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch {
    return map;
  }
  if (!Array.isArray(items)) {
    return map;
  }
  items.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const { number, state, url, headRefName } = item as {
      number?: unknown;
      state?: unknown;
      url?: unknown;
      headRefName?: unknown;
    };
    const prState = toPrState(state);
    if (!prState || typeof headRefName !== "string" || headRefName.length === 0) {
      return;
    }
    const existing = map.get(headRefName);
    if (existing && PR_STATE_PRIORITY[existing.state] <= PR_STATE_PRIORITY[prState]) {
      return;
    }
    map.set(headRefName, {
      state: prState,
      url: typeof url === "string" ? url : null,
      number: typeof number === "number" ? number : null,
    });
  });
  return map;
};

export const fetchBranchPrMap = async (
  repoRoot: string,
): Promise<Map<string, BranchPrInfo> | null> => {
  const nowMs = Date.now();
  const cached = prCache.get(repoRoot);
  if (cached && nowMs - cached.at < PR_CACHE_TTL_MS) {
    return cached.map;
  }
  const pending = inflight.get(repoRoot);
  if (pending) {
    return pending;
  }
  const request = (async () => {
    try {
      const result = await execa(
        "gh",
        [
          "pr",
          "list",
          "--state",
          "all",
          "--limit",
          "200",
          "--json",
          "number,state,url,headRefName",
        ],
        { cwd: repoRoot, timeout: GH_TIMEOUT_MS },
      );
      return parseGhPrListOutput(result.stdout ?? "");
    } catch {
      return null;
    } finally {
      inflight.delete(repoRoot);
    }
  })();
  inflight.set(repoRoot, request);
  const map = await request;
  prCache.set(repoRoot, { at: nowMs, map });
  return map;
};
