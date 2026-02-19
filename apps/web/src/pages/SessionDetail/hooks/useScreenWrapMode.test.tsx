import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { screenWrapModeAtom } from "../atoms/screenAtoms";
import { __testables, useScreenWrapMode } from "./useScreenWrapMode";

describe("useScreenWrapMode", () => {
  const createWrapper = () => {
    const store = createStore();
    store.set(screenWrapModeAtom, "off");
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  beforeEach(() => {
    window.localStorage.removeItem(__testables.SCREEN_WRAP_MODE_STORAGE_KEY);
  });

  it("uses off when no stored value exists", () => {
    const { result } = renderHook(() => useScreenWrapMode(), { wrapper: createWrapper() });
    expect(result.current.wrapMode).toBe("off");
  });

  it("restores stored wrap mode from localStorage", async () => {
    window.localStorage.setItem(__testables.SCREEN_WRAP_MODE_STORAGE_KEY, "smart");
    const { result } = renderHook(() => useScreenWrapMode(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.wrapMode).toBe("smart");
    });
  });

  it("persists toggled value to localStorage", () => {
    const { result } = renderHook(() => useScreenWrapMode(), { wrapper: createWrapper() });
    act(() => {
      result.current.toggleWrapMode();
    });
    expect(result.current.wrapMode).toBe("smart");
    expect(window.localStorage.getItem(__testables.SCREEN_WRAP_MODE_STORAGE_KEY)).toBe("smart");
  });
});
