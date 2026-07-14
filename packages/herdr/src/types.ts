export type HerdrRequester = {
  request: <T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<T>;
};
