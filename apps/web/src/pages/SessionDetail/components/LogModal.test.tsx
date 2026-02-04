// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { logModalDisplayLinesAtom, logModalIsAtBottomAtom } from "../atoms/logAtoms";
import { createSessionDetail } from "../test-helpers";
import { LogModal } from "./LogModal";

let latestOnUserScrollStateChange: ((value: boolean) => void) | null = null;

vi.mock("../hooks/useStableVirtuosoScroll", () => ({
  useStableVirtuosoScroll: ({
    onUserScrollStateChange,
  }: {
    onUserScrollStateChange?: (value: boolean) => void;
  }) => {
    latestOnUserScrollStateChange = onUserScrollStateChange ?? null;
    return {
      scrollerRef: { current: null },
      handleRangeChanged: vi.fn(),
    };
  },
}));

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

describe("LogModal", () => {
  type LogModalState = Parameters<typeof LogModal>[0]["state"];
  type LogModalActions = Parameters<typeof LogModal>[0]["actions"];

  const createWrapper = () => {
    const store = createStore();
    store.set(logModalIsAtBottomAtom, true);
    store.set(logModalDisplayLinesAtom, []);
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  const buildState = (overrides: Partial<LogModalState> = {}): LogModalState => ({
    open: true,
    session: createSessionDetail(),
    logLines: [],
    loading: false,
    error: null,
    ...overrides,
  });

  const buildActions = (overrides: Partial<LogModalActions> = {}): LogModalActions => ({
    onClose: vi.fn(),
    onOpenHere: vi.fn(),
    onOpenNewTab: vi.fn(),
    ...overrides,
  });

  it("returns null when closed", () => {
    const state = buildState({ open: false });
    const actions = buildActions();
    const wrapper = createWrapper();
    const { container } = render(<LogModal state={state} actions={actions} />, { wrapper });

    expect(container.firstChild).toBeNull();
  });

  it("renders log modal content and handles actions", () => {
    const onClose = vi.fn();
    const onOpenHere = vi.fn();
    const onOpenNewTab = vi.fn();
    const session = createSessionDetail({ customTitle: "Custom" });
    const state = buildState({
      open: true,
      session,
      logLines: ["line1"],
      loading: true,
      error: "Log error",
    });
    const actions = buildActions({ onClose, onOpenHere, onOpenNewTab });
    const wrapper = createWrapper();
    render(<LogModal state={state} actions={actions} />, { wrapper });

    expect(screen.getByText("Custom")).toBeTruthy();
    expect(screen.getByText("Log error")).toBeTruthy();
    expect(screen.getByText("Loading log...")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close log"));
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Open here"));
    expect(onOpenHere).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Open in new tab"));
    expect(onOpenNewTab).toHaveBeenCalled();
  });

  it("buffers log lines while user is scrolling", () => {
    const session = createSessionDetail();
    const state = buildState({ session, logLines: ["line1"] });
    const actions = buildActions();
    const wrapper = createWrapper();
    const { rerender } = render(<LogModal state={state} actions={actions} />, { wrapper });

    expect(screen.getByText("line1")).toBeTruthy();

    act(() => {
      latestOnUserScrollStateChange?.(true);
    });

    rerender(
      <LogModal
        state={{
          ...state,
          logLines: ["line1", "line2"],
        }}
        actions={actions}
      />,
    );

    expect(screen.queryByText("line2")).toBeNull();

    act(() => {
      latestOnUserScrollStateChange?.(false);
    });

    expect(screen.getByText("line2")).toBeTruthy();
  });
});
