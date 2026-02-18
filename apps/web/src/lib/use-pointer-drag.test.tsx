import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePointerDrag } from "./use-pointer-drag";

describe("usePointerDrag", () => {
  afterEach(() => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });

  it("continues drag across rerenders and uses latest onMove", () => {
    const onMoveA = vi.fn();
    const onMoveB = vi.fn();
    const onEnd = vi.fn();

    const { result, rerender } = renderHook(({ onMove }) => usePointerDrag({ onMove, onEnd }), {
      initialProps: { onMove: onMoveA },
    });

    act(() => {
      result.current.startDrag({} as never, { startX: 0 });
    });

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10 }));
    });

    expect(onMoveA).toHaveBeenCalledTimes(1);

    rerender({ onMove: onMoveB });

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 20 }));
    });

    expect(onMoveB).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(onEnd).toHaveBeenCalledWith({ startX: 0 });
  });
});
