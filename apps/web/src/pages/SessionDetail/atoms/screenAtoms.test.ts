import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import { initialScreenLoadingState } from "@/lib/screen-loading";

import {
  screenErrorAtom,
  screenFallbackReasonAtom,
  screenImageAtom,
  screenLoadingAtom,
  screenModeAtom,
  screenModeLoadedAtom,
  screenTextAtom,
  screenWrapModeAtom,
} from "./screenAtoms";

describe("screen atoms", () => {
  it("has expected defaults", () => {
    const store = createStore();

    expect(store.get(screenModeAtom)).toBe("text");
    expect(store.get(screenWrapModeAtom)).toBe("off");
    expect(store.get(screenModeLoadedAtom)).toEqual({ text: false, image: false });
    expect(store.get(screenTextAtom)).toBe("");
    expect(store.get(screenImageAtom)).toBeNull();
    expect(store.get(screenFallbackReasonAtom)).toBeNull();
    expect(store.get(screenErrorAtom)).toBeNull();
    expect(store.get(screenLoadingAtom)).toEqual(initialScreenLoadingState);
  });

  it("supports updating core atoms", () => {
    const store = createStore();
    const nextLoaded = { text: true, image: true } as const;
    const nextLoading = { loading: true, mode: "image" as const };

    store.set(screenModeAtom, "image");
    store.set(screenWrapModeAtom, "smart");
    store.set(screenModeLoadedAtom, nextLoaded);
    store.set(screenTextAtom, "hello");
    store.set(screenImageAtom, "abc123");
    store.set(screenFallbackReasonAtom, "fallback");
    store.set(screenErrorAtom, "error");
    store.set(screenLoadingAtom, nextLoading);

    expect(store.get(screenModeAtom)).toBe("image");
    expect(store.get(screenWrapModeAtom)).toBe("smart");
    expect(store.get(screenModeLoadedAtom)).toEqual(nextLoaded);
    expect(store.get(screenTextAtom)).toBe("hello");
    expect(store.get(screenImageAtom)).toBe("abc123");
    expect(store.get(screenFallbackReasonAtom)).toBe("fallback");
    expect(store.get(screenErrorAtom)).toBe("error");
    expect(store.get(screenLoadingAtom)).toEqual(nextLoading);
  });
});
