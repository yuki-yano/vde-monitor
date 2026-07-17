const DEFAULT_MAX_ENTRIES = 10_000;

export const createRateLimiter = (
  windowMs: number,
  max: number,
  options?: { maxEntries?: number },
) => {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const hits = new Map<string, { count: number; expiresAt: number }>();
  // Earliest possible expiry across all entries. While the table is full and
  // this lies in the future, new keys are refused in O(1) instead of paying a
  // full sweep per rejected request.
  let nextExpiryAtMs = Number.POSITIVE_INFINITY;
  const sweepExpired = (nowMs: number) => {
    let next = Number.POSITIVE_INFINITY;
    hits.forEach((entry, key) => {
      if (entry.expiresAt <= nowMs) {
        hits.delete(key);
        return;
      }
      next = Math.min(next, entry.expiresAt);
    });
    nextExpiryAtMs = next;
  };
  return (key: string) => {
    const nowMs = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.expiresAt <= nowMs) {
      if (entry == null && hits.size >= maxEntries) {
        if (nextExpiryAtMs > nowMs) {
          return false;
        }
        sweepExpired(nowMs);
        if (hits.size >= maxEntries) {
          // Refuse new keys instead of growing without bound; existing keys
          // keep working, so this only throttles a flood of unique clients.
          return false;
        }
      }
      hits.set(key, { count: 1, expiresAt: nowMs + windowMs });
      nextExpiryAtMs = Math.min(nextExpiryAtMs, nowMs + windowMs);
      return true;
    }
    if (entry.count >= max) {
      return false;
    }
    entry.count += 1;
    return true;
  };
};
