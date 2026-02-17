import { atom, type PrimitiveAtom } from "jotai";

export type ScreenCacheEntry = {
  screen: string;
  capturedAt: string;
  updatedAt: number;
  truncated?: boolean | null;
};

const cacheAtoms = new Map<string, PrimitiveAtom<Record<string, ScreenCacheEntry>>>();
const loadingAtoms = new Map<string, PrimitiveAtom<Record<string, boolean>>>();
const errorAtoms = new Map<string, PrimitiveAtom<Record<string, string | null>>>();

const getOrCreateAtom = <T>(store: Map<string, PrimitiveAtom<T>>, key: string, initial: T) => {
  const existing = store.get(key);
  if (existing) {
    return existing;
  }
  const created = atom(initial);
  store.set(key, created);
  return created;
};

export const getScreenCacheAtom = (key: string) => getOrCreateAtom(cacheAtoms, key, {});

export const getScreenCacheLoadingAtom = (key: string) => getOrCreateAtom(loadingAtoms, key, {});

export const getScreenCacheErrorAtom = (key: string) => getOrCreateAtom(errorAtoms, key, {});
