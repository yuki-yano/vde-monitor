import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./apps/web/src/test/msw/server";

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key: (index: number) => {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
  };
};

const defineStorage = (target: typeof globalThis, key: "localStorage" | "sessionStorage") => {
  try {
    Object.defineProperty(target, key, {
      value: createMemoryStorage(),
      configurable: true,
    });
  } catch {
    // Ignore if storage is not configurable in the test environment.
  }
};

if (typeof window !== "undefined") {
  defineStorage(window, "localStorage");
  defineStorage(window, "sessionStorage");
  defineStorage(globalThis, "localStorage");
  defineStorage(globalThis, "sessionStorage");
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => {
  server.close();
});
