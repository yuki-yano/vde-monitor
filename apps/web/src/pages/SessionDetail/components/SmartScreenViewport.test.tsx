import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { SmartScreenViewport } from "./SmartScreenViewport";

type ScrollMetrics = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
};

const installScrollMetrics = (node: HTMLDivElement, metrics: ScrollMetrics) => {
  const scrollTopSetter = vi.fn();
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

describe("SmartScreenViewport", () => {
  const setup = (lines: string[]) => {
    const scrollerRef = createRef<HTMLDivElement>();
    const props = {
      classifications: [],
      loading: false,
      loadingLabel: "Loading...",
      isAtBottom: true,
      onAtBottomChange: vi.fn(),
      onRangeChanged: vi.fn(),
      scrollerRef,
      onScrollToBottom: vi.fn(),
      onUserScrollStateChange: vi.fn(),
      sanitizeCopyText: (raw: string) => raw,
      onLineClick: vi.fn(),
      onLineKeyDown: vi.fn(),
    };
    const view = render(<SmartScreenViewport lines={lines} {...props} />);
    const rerenderLines = (nextLines: string[]) =>
      view.rerender(<SmartScreenViewport lines={nextLines} {...props} />);
    return { scrollerRef, rerenderLines };
  };

  it("does not reassign scrollTop when the scroller is already at the bottom", () => {
    const { scrollerRef, rerenderLines } = setup(["line-1"]);
    const node = scrollerRef.current;
    expect(node).not.toBeNull();
    if (!node) return;

    const scrollTopSetter = installScrollMetrics(node, {
      scrollHeight: 100,
      clientHeight: 100,
      scrollTop: 0,
    });

    rerenderLines(["line-1", "line-2"]);

    expect(scrollTopSetter).not.toHaveBeenCalled();
  });

  it("sticks to the bottom when content grows past the viewport", () => {
    const { scrollerRef, rerenderLines } = setup(["line-1"]);
    const node = scrollerRef.current;
    expect(node).not.toBeNull();
    if (!node) return;

    const scrollTopSetter = installScrollMetrics(node, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 50,
    });

    rerenderLines(["line-1", "line-2"]);

    expect(scrollTopSetter).toHaveBeenCalledWith(200);
  });
});
