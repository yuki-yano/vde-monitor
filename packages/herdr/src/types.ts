export type HerdrRequester = {
  request: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
};
