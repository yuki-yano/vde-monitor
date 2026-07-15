import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
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

type ScrollMetrics = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
};

const installScrollMetrics = (node: HTMLDivElement, metrics: ScrollMetrics) => {
  const scrollTopSetter = vi.fn((value: number) => {
    metrics.scrollTop = value;
  });
  Object.defineProperty(node, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(node, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(node, "scrollTop", {
    configurable: true,
    get: () => metrics.scrollTop,
    set: scrollTopSetter,
  });
  return scrollTopSetter;
};

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

  it("pins the scroller to the bottom before paint when followed output grows", () => {
    const scrollerRef = createRef<HTMLDivElement>();
    const node = document.createElement("div");
    scrollerRef.current = node;
    const metrics = { scrollHeight: 100, clientHeight: 100, scrollTop: 0 };
    const scrollTopSetter = installScrollMetrics(node, metrics);
    const props = {
      loading: false,
      loadingLabel: "Loading",
      isAtBottom: true,
      shouldFollowOutput: true,
      onAtBottomChange: vi.fn(),
      scrollerRef,
    };
    const view = render(<AnsiVirtualizedViewport {...props} lines={["line-1"]} />);

    metrics.scrollHeight = 200;
    metrics.scrollTop = 50;
    view.rerender(<AnsiVirtualizedViewport {...props} lines={["line-1", "line-2"]} />);

    expect(scrollTopSetter).toHaveBeenCalledWith(200);
  });

  it("does not pin growing output after following is paused", () => {
    const scrollerRef = createRef<HTMLDivElement>();
    const node = document.createElement("div");
    scrollerRef.current = node;
    const metrics = { scrollHeight: 100, clientHeight: 100, scrollTop: 0 };
    const scrollTopSetter = installScrollMetrics(node, metrics);
    const props = {
      loading: false,
      loadingLabel: "Loading",
      isAtBottom: true,
      shouldFollowOutput: false,
      onAtBottomChange: vi.fn(),
      scrollerRef,
    };
    const view = render(<AnsiVirtualizedViewport {...props} lines={["line-1"]} />);

    metrics.scrollHeight = 200;
    metrics.scrollTop = 50;
    view.rerender(<AnsiVirtualizedViewport {...props} lines={["line-1", "line-2"]} />);

    expect(scrollTopSetter).not.toHaveBeenCalled();
  });

  it("does not rewrite scrollTop when followed output remains at the bottom", () => {
    const scrollerRef = createRef<HTMLDivElement>();
    const node = document.createElement("div");
    scrollerRef.current = node;
    const metrics = { scrollHeight: 100, clientHeight: 100, scrollTop: 0 };
    const scrollTopSetter = installScrollMetrics(node, metrics);
    const props = {
      loading: false,
      loadingLabel: "Loading",
      isAtBottom: true,
      shouldFollowOutput: true,
      onAtBottomChange: vi.fn(),
      scrollerRef,
    };
    const view = render(<AnsiVirtualizedViewport {...props} lines={["line-1"]} />);

    metrics.scrollHeight = 200;
    metrics.scrollTop = 100;
    view.rerender(<AnsiVirtualizedViewport {...props} lines={["line-1", "line-2"]} />);

    expect(scrollTopSetter).not.toHaveBeenCalled();
  });
});
