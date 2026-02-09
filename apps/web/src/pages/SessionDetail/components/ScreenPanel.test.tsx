// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    contextLeftLabel: null,
    isScreenLoading: false,
    imageBase64: null,
    screenLines: ["line"],
    virtuosoRef: { current: null },
    scrollerRef: { current: null },
    isAtBottom: true,
    forceFollow: false,
    rawMode: false,
    allowDangerKeys: false,
    fileResolveError: null,
    ...overrides,
  });

  const buildActions = (overrides: Partial<ScreenPanelActions> = {}): ScreenPanelActions => ({
    onModeChange: vi.fn(),
    onRefresh: vi.fn(),
    onAtBottomChange: vi.fn(),
    onScrollToBottom: vi.fn(),
    onUserScrollStateChange: vi.fn(),
    onResolveFileReference: vi.fn(async () => undefined),
    onResolveFileReferenceCandidates: vi.fn(async (rawTokens: string[]) => rawTokens),
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

  it("shows context-left label when available", () => {
    const state = buildState({ contextLeftLabel: "73% context left" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("73% context left")).toBeTruthy();
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

  it("shows file resolve error", () => {
    const state = buildState({ fileResolveError: "No file matched: index.ts" });
    const actions = buildActions();
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    expect(screen.getByText("No file matched: index.ts")).toBeTruthy();
  });

  it("resolves file reference when clicking linkified token", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["failed at src/main.ts(10,2):"],
    });
    const actions = buildActions({ onResolveFileReference, onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });
    let ref: HTMLElement | null = null;
    await waitFor(() => {
      ref = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts(10,2):']");
      expect(ref).toBeTruthy();
    });
    if (!ref) {
      throw new Error("expected linkified file reference");
    }
    fireEvent.click(ref);

    await waitFor(() => {
      expect(onResolveFileReference).toHaveBeenCalledWith("src/main.ts(10,2):");
    });
  });

  it("resolves file reference when pressing Enter on linkified token", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["failed at src/main.ts:3"],
    });
    const actions = buildActions({ onResolveFileReference, onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });
    let ref: HTMLElement | null = null;
    await waitFor(() => {
      ref = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts:3']");
      expect(ref).toBeTruthy();
    });
    if (!ref) {
      throw new Error("expected linkified file reference");
    }
    fireEvent.keyDown(ref, { key: "Enter" });

    await waitFor(() => {
      expect(onResolveFileReference).toHaveBeenCalledWith("src/main.ts:3");
    });
  });

  it("does not linkify non-existing file references", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async () => []);
    const state = buildState({
      screenLines: ["failed at src/missing.ts:12"],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });
    expect(container.querySelector("[data-vde-file-ref]")).toBeNull();
  });

  it("renders link without underline class", async () => {
    const state = buildState({
      screenLines: ["see src/main.ts:1"],
    });
    const actions = buildActions();
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      const ref = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts:1']");
      expect(ref).toBeTruthy();
      expect(ref?.className.includes("underline")).toBe(false);
    });
  });

  it("keeps hovered link highlight across rerender", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const actions = buildActions({ onResolveFileReferenceCandidates });
    const { container, rerender } = render(
      <ScreenPanel
        state={buildState({
          screenLines: ["see src/main.ts:1"],
        })}
        actions={actions}
        controls={null}
      />,
    );

    let initialRef: HTMLElement | null = null;
    await waitFor(() => {
      initialRef = container.querySelector<HTMLElement>("[data-vde-file-ref='src/main.ts:1']");
      expect(initialRef).toBeTruthy();
    });
    if (!initialRef) {
      throw new Error("expected linkified file reference");
    }
    fireEvent.mouseMove(initialRef);

    await waitFor(() => {
      const hoveredRef = container.querySelector<HTMLElement>(
        "[data-vde-file-ref='src/main.ts:1']",
      );
      expect(hoveredRef?.className.includes("text-latte-lavender")).toBe(true);
    });

    rerender(
      <ScreenPanel
        state={buildState({
          screenLines: ["again src/main.ts:1"],
        })}
        actions={actions}
        controls={null}
      />,
    );

    await waitFor(() => {
      const rerenderedRef = container.querySelector<HTMLElement>(
        "[data-vde-file-ref='src/main.ts:1']",
      );
      expect(rerenderedRef).toBeTruthy();
      expect(rerenderedRef?.className.includes("text-latte-lavender")).toBe(true);
    });
  });

  it("passes raw token candidates to resolver", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const state = buildState({
      screenLines: ["aaa src/main.ts:1 index.test.tsx https://example.com"],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalledWith([
        "src/main.ts:1",
        "index.test.tsx",
      ]);
    });
  });

  it("passes all visible-range candidates without token cap", async () => {
    const onResolveFileReferenceCandidates = vi.fn(async (rawTokens: string[]) => rawTokens);
    const manyTokens = Array.from({ length: 180 }, (_, index) => `file-${index}.ts`).join(" ");
    const state = buildState({
      screenLines: [manyTokens],
    });
    const actions = buildActions({ onResolveFileReferenceCandidates });
    render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalled();
    });

    const firstCallArgs = onResolveFileReferenceCandidates.mock.calls[0]?.[0] as
      | string[]
      | undefined;
    expect(firstCallArgs?.length).toBe(180);
    expect(firstCallArgs?.[0]).toBe("file-0.ts");
    expect(firstCallArgs?.at(-1)).toBe("file-179.ts");
  });

  it("invokes file resolver only for verified links", async () => {
    const onResolveFileReference = vi.fn(async () => undefined);
    const onResolveFileReferenceCandidates = vi.fn(async () => ["src/exists.ts:2"]);
    const state = buildState({
      screenLines: ["src/missing.ts:1 src/exists.ts:2"],
    });
    const actions = buildActions({ onResolveFileReference, onResolveFileReferenceCandidates });
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(container.querySelector("[data-vde-file-ref='src/missing.ts:1']")).toBeNull();
      expect(container.querySelector("[data-vde-file-ref='src/exists.ts:2']")).toBeTruthy();
    });

    fireEvent.click(container.querySelector("[data-vde-file-ref='src/exists.ts:2']") as Element);
    expect(onResolveFileReference).toHaveBeenCalledWith("src/exists.ts:2");
  });

  it("linkifies comma-separated filename tokens in explored logs", async () => {
    const state = buildState({
      screenLines: ["└ Read SessionDetailView.test.tsx, useSessionDetailVM.test.tsx"],
    });
    const actions = buildActions();
    const { container } = render(<ScreenPanel state={state} actions={actions} controls={null} />);

    await waitFor(() => {
      expect(
        container.querySelector("[data-vde-file-ref='SessionDetailView.test.tsx,']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-vde-file-ref='useSessionDetailVM.test.tsx']"),
      ).toBeTruthy();
    });
  });

  it("keeps existing verified links when follow-up candidate resolution returns empty", async () => {
    const onResolveFileReferenceCandidates = vi
      .fn<ScreenPanelActions["onResolveFileReferenceCandidates"]>()
      .mockImplementationOnce(async (rawTokens) => rawTokens)
      .mockImplementationOnce(async () => []);
    const actions = buildActions({ onResolveFileReferenceCandidates });
    const { container, rerender } = render(
      <ScreenPanel
        state={buildState({
          screenLines: ["└ Read SessionDetailView.test.tsx, useSessionDetailVM.test.tsx"],
        })}
        actions={actions}
        controls={null}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector("[data-vde-file-ref='SessionDetailView.test.tsx,']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-vde-file-ref='useSessionDetailVM.test.tsx']"),
      ).toBeTruthy();
    });

    rerender(
      <ScreenPanel
        state={buildState({
          screenLines: [
            "• Explored",
            "└ Read SessionDetailView.test.tsx, useSessionDetailVM.test.tsx",
          ],
        })}
        actions={actions}
        controls={null}
      />,
    );

    await waitFor(() => {
      expect(onResolveFileReferenceCandidates).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-vde-file-ref='SessionDetailView.test.tsx,']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-vde-file-ref='useSessionDetailVM.test.tsx']"),
      ).toBeTruthy();
    });
  });
});
