const DEFAULT_MAX_ENTRIES = 10_000;

export const createRateLimiter = (
  windowMs: number,
  max: number,
  options?: { maxEntries?: number },
) => {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const hits = new Map<string, { count: number; expiresAt: number }>();
  const sweepExpired = (nowMs: number) => {
    hits.forEach((entry, key) => {
      if (entry.expiresAt <= nowMs) {
        hits.delete(key);
      }
    });
  };
  return (key: string) => {
    const nowMs = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.expiresAt <= nowMs) {
      if (entry == null && hits.size >= maxEntries) {
        sweepExpired(nowMs);
        if (hits.size >= maxEntries) {
          // Refuse new keys instead of growing without bound; existing keys
          // keep working, so this only throttles a flood of unique clients.
          return false;
        }
      }
      hits.set(key, { count: 1, expiresAt: nowMs + windowMs });
      return true;
    }
    if (entry.count >= max) {
      return false;
    }
    entry.count += 1;
    return true;
  };
};
