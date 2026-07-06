import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useScreenPanelWorktreeSelector } from "./useScreenPanelWorktreeSelector";

describe("useScreenPanelWorktreeSelector", () => {
  it("does not reopen when enabled recovers after being disabled", () => {
    const containerRef = createRef<HTMLDivElement>();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useScreenPanelWorktreeSelector({
          enabled,
          onRefreshScreen: vi.fn(),
          containerRef,
        }),
      { initialProps: { enabled: true } },
    );

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    rerender({ enabled: false });
    expect(result.current.isOpen).toBe(false);

    rerender({ enabled: true });
    expect(result.current.isOpen).toBe(false);
  });
});
