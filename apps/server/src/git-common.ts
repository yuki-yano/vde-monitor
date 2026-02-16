export const GIT_CACHE_TTL_MS = 3000;
export const GIT_PATCH_MAX_BYTES = 2_000_000;

export const shouldReuseCacheEntry = ({
  force,
  cachedAt,
  nowMs,
  ttlMs,
}: {
  force: boolean | undefined;
  cachedAt: number;
  nowMs: number;
  ttlMs: number;
}) => !force && nowMs - cachedAt < ttlMs;

export const truncateTextByLength = ({ text, maxLength }: { text: string; maxLength: number }) => {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, maxLength),
    truncated: true,
  };
};
