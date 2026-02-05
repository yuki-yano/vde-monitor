// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ScreenPanel } from "./ScreenPanel";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data = [],
    itemContent,
  }: {
    data?: string[];
    itemContent: (index: number, item: string) => ReactNode;
  }) => (
    <div data-testid="virtuoso">
      {data.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}));

describe("ScreenPanel", () => {
  type ScreenPanelState = Parameters<typeof ScreenPanel>[0]["state"];
  type ScreenPanelActions = Parameters<typeof ScreenPanel>[0]["actions"];

  const buildState = (overrides: Partial<ScreenPanelState> = {}): ScreenPanelState => ({
    mode: "text",
    connectionIssue: null,
    fallbackReason: null,
    error: null,
    isScreenLoading: false,
    imageBase64: null,
    screenLines: ["line"],
    virtuosoRef: { current: null },
    scrollerRef: { current: null },
    isAtBottom: true,
    forceFollow: false,
    rawMode: false,
    allowDangerKeys: false,
    ...overrides,
  });

  const buildActions = (overrides: Partial<ScreenPanelActions> = {}): ScreenPanelActions => ({
    onModeChange: vi.fn(),
    onRefresh: vi.fn(),
    onAtBottomChange: vi.fn(),
    onScrollToBottom: vi.fn(),
    onUserScrollStateChange: vi.fn(),
    ...overrides,
  });

  it("shows raw indicator when enabled", () => {
    const state = buildState({ rawMode: true, allowDangerKeys: true });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("Raw")).toBeTruthy();
    expect(screen.getByText("Unsafe")).toBeTruthy();
  });

  it("renders fallback and error messages", () => {
    const state = buildState({ fallbackReason: "image_failed", error: "Screen error" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("Image fallback: image_failed")).toBeTruthy();
    expect(screen.getByText("Screen error")).toBeTruthy();
  });

  it("hides duplicate connection errors", () => {
    const state = buildState({
      connectionIssue: "Disconnected. Reconnecting...",
      error: "Disconnected. Reconnecting...",
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.queryByText("Disconnected. Reconnecting...")).toBeNull();
  });

  it("renders image mode content", () => {
    const state = buildState({
      mode: "image",
      imageBase64: "abc123",
      screenLines: [],
    });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const img = screen.getByAltText("screen") as HTMLImageElement;
    expect(img.src).toContain("data:image/png;base64,abc123");
  });

  it("shows scroll-to-bottom button when not at bottom", () => {
    const onScrollToBottom = vi.fn();
    const state = buildState({ isAtBottom: false });
    const actions = buildActions({ onScrollToBottom });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    fireEvent.click(screen.getByLabelText("Scroll to bottom"));
    expect(onScrollToBottom).toHaveBeenCalledWith("smooth");
  });

  it("invokes refresh handler", () => {
    const onRefresh = vi.fn();
    const state = buildState();
    const actions = buildActions({ onRefresh });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const buttons = screen.queryAllByLabelText("Refresh screen");
    const first = buttons[0];
    expect(first).toBeTruthy();
    fireEvent.click(first as Element);
    expect(onRefresh).toHaveBeenCalled();
  });

  it("sanitizes copied log text", () => {
    const selection = { toString: () => "line\u0007bell" } as unknown as Selection;
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue(selection);
    const setData = vi.fn();
    const state = buildState();
    const actions = buildActions();

    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    const container = screen.getByTestId("virtuoso").parentElement;
    expect(container).toBeTruthy();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { setData } });
    container?.dispatchEvent(event);

    expect(setData).toHaveBeenCalledWith("text/plain", "linebell");
    expect(event.defaultPrevented).toBe(true);
    getSelectionSpy.mockRestore();
  });
});
