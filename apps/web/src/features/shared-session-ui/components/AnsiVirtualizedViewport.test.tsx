import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnsiVirtualizedViewport } from "./AnsiVirtualizedViewport";

const virtuosoState = vi.hoisted(() => ({
  followOutput: undefined as "auto" | "smooth" | boolean | undefined,
}));

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({ followOutput }: { followOutput?: "auto" | "smooth" | boolean }) => {
    virtuosoState.followOutput = followOutput;
    return <div data-testid="virtuoso" />;
  },
}));

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

  it("disables followOutput while the viewport is paused above the bottom", () => {
    const props = {
      lines: ["line-1", "line-2"],
      loading: false,
      loadingLabel: "Loading",
      onAtBottomChange: vi.fn(),
    };
    const { rerender } = render(
      <AnsiVirtualizedViewport {...props} isAtBottom followOutput="smooth" />,
    );

    expect(virtuosoState.followOutput).toBe("smooth");

    rerender(<AnsiVirtualizedViewport {...props} isAtBottom={false} followOutput="smooth" />);

    expect(virtuosoState.followOutput).toBe(false);
  });

  it("follows explicit follow intent independently from the physical bottom state", () => {
    render(
      <AnsiVirtualizedViewport
        lines={["line-1", "line-2"]}
        loading={false}
        loadingLabel="Loading"
        isAtBottom={false}
        onAtBottomChange={vi.fn()}
        followOutput="smooth"
        shouldFollowOutput
      />,
    );

    expect(virtuosoState.followOutput).toBe("smooth");
  });
});
