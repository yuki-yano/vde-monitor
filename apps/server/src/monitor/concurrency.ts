type SettledMapResult<R> =
  | { status: "fulfilled"; value: R }
  | { status: "rejected"; reason: unknown };

export const mapWithConcurrencyLimit = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = [];
  results.length = items.length;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

export const mapWithConcurrencyLimitSettled = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<SettledMapResult<R>[]> => {
  return mapWithConcurrencyLimit(items, limit, async (item, index) => {
    try {
      return { status: "fulfilled", value: await mapper(item, index) };
    } catch (error) {
      return { status: "rejected", reason: error };
    }
  });
};
