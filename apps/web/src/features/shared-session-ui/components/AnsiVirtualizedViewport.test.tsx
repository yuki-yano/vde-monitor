// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnsiVirtualizedViewport } from "./AnsiVirtualizedViewport";

describe("AnsiVirtualizedViewport", () => {
  it("shows scroll-to-bottom button and delegates click handler", () => {
    const onScrollToBottom = vi.fn();

    render(
      <AnsiVirtualizedViewport
        lines={["line-1", "line-2"]}
        loading={false}
        loadingLabel="Loading"
        isAtBottom={false}
        onAtBottomChange={vi.fn()}
        onScrollToBottom={onScrollToBottom}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Scroll to bottom" }));
    expect(onScrollToBottom).toHaveBeenCalledWith("smooth");
  });

  it("sanitizes copied text when sanitizer is provided", () => {
    const setData = vi.fn();
    const preventDefault = vi.fn();
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "line-1\r\nline-2",
    } as unknown as Selection);

    const { container } = render(
      <AnsiVirtualizedViewport
        lines={["line-1", "line-2"]}
        loading={false}
        loadingLabel="Loading"
        isAtBottom
        onAtBottomChange={vi.fn()}
        sanitizeCopyText={(raw) => raw.replace(/\r\n/gu, "\n")}
      />,
    );

    const event = new Event("copy", { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData,
      },
    });
    event.preventDefault = preventDefault;

    container.firstElementChild?.dispatchEvent(event);

    expect(setData).toHaveBeenCalledWith("text/plain", "line-1\nline-2");
    expect(preventDefault).toHaveBeenCalled();
    getSelectionSpy.mockRestore();
  });
});
