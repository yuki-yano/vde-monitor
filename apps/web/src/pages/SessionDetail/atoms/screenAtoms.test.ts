import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import { initialScreenLoadingState } from "@/lib/screen-loading";

import {
  screenLinesAtom,
  screenLoadingAtom,
  screenModeAtom,
  screenModeLoadedAtom,
  screenTextAtom,
} from "./screenAtoms";

vi.mock("@/lib/ansi", () => ({
  renderAnsiLines: (text: string) => (text.length > 0 ? text.split("\n") : []),
}));

describe("screenLinesAtom", () => {
  it("does not show fallback text while text screen is loading", () => {
    const store = createStore();
    store.set(screenModeAtom, "text");
    store.set(screenTextAtom, "");
    store.set(screenLoadingAtom, { loading: true, mode: "text" });

    expect(store.get(screenLinesAtom)).toEqual([]);
  });

  it("does not show fallback text before initial text load completes", () => {
    const store = createStore();
    store.set(screenModeAtom, "text");
    store.set(screenTextAtom, "");
    store.set(screenModeLoadedAtom, { text: false, image: false });
    store.set(screenLoadingAtom, initialScreenLoadingState);

    expect(store.get(screenLinesAtom)).toEqual([]);
  });

  it("shows fallback text when text screen is idle with no data", () => {
    const store = createStore();
    store.set(screenModeAtom, "text");
    store.set(screenTextAtom, "");
    store.set(screenModeLoadedAtom, { text: true, image: false });
    store.set(screenLoadingAtom, initialScreenLoadingState);

    expect(store.get(screenLinesAtom)).toEqual(["No screen data"]);
  });
});
