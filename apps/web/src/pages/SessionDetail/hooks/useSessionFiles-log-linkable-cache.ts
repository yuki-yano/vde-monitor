import type { MutableRefObject } from "react";

type LogReferenceLinkableCacheKeyInput = {
  sourcePaneId: string;
  sourceRepoRoot: string | null;
  kind: "path" | "filename" | "unknown";
  normalizedPath: string | null;
  filename: string | null;
  display: string;
};

type ResolveLogReferenceLinkableWithCacheInput = {
  cacheRef: MutableRefObject<Map<string, boolean>>;
  requestMapRef: MutableRefObject<Map<string, Promise<boolean>>>;
  cacheKey: string;
  cacheMaxSize: number;
  resolve: () => Promise<boolean>;
};

const setMapEntryWithMaxSize = <K, V>(map: Map<K, V>, key: K, value: V, maxSize: number) => {
  if (!map.has(key) && map.size >= maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey != null) {
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
};

export const buildLogReferenceLinkableCacheKey = ({
  sourcePaneId,
  sourceRepoRoot,
  kind,
  normalizedPath,
  filename,
  display,
}: LogReferenceLinkableCacheKeyInput) => {
  const normalizedCacheSubject = normalizedPath ?? filename ?? display;
  return `${sourcePaneId}:${sourceRepoRoot ?? ""}:${kind}:${normalizedCacheSubject}`;
};

export const resolveLogReferenceLinkableWithCache = async ({
  cacheRef,
  requestMapRef,
  cacheKey,
  cacheMaxSize,
  resolve,
}: ResolveLogReferenceLinkableWithCacheInput) => {
  const cached = cacheRef.current.get(cacheKey);
  if (cached != null) {
    return cached;
  }

  const inFlight = requestMapRef.current.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = resolve();
  requestMapRef.current.set(cacheKey, request);
  try {
    const resolved = await request;
    setMapEntryWithMaxSize(cacheRef.current, cacheKey, resolved, cacheMaxSize);
    return resolved;
  } finally {
    requestMapRef.current.delete(cacheKey);
  }
};
