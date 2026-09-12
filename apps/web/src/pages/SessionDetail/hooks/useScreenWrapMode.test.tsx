import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
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

  it("starts off, persists a toggle, and restores it into a fresh store", async () => {
    const { result, unmount } = renderHook(() => useScreenWrapMode(), { wrapper: createWrapper() });
    expect(result.current.wrapMode).toBe("off");

    act(() => result.current.toggleWrapMode());
    expect(result.current.wrapMode).toBe("smart");
    expect(window.localStorage.getItem(__testables.SCREEN_WRAP_MODE_STORAGE_KEY)).toBe("smart");
    unmount();

    const restored = renderHook(() => useScreenWrapMode(), { wrapper: createWrapper() });
    await waitFor(() => expect(restored.result.current.wrapMode).toBe("smart"));
  });
});
