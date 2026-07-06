import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLazyRef } from "./use-lazy-ref";

describe("useLazyRef", () => {
  it("runs the factory only once when the stored value is null", () => {
    const factory = vi.fn<() => string | null>(() => null);
    const { result, rerender } = renderHook(() => useLazyRef(factory));

    expect(result.current.current).toBeNull();

    rerender();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBeNull();
  });
});
