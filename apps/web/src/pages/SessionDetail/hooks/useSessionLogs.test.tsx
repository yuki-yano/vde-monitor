import { act, renderHook, waitFor } from "@testing-library/react";
import type { ScreenResponse } from "@vde-monitor/shared";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logModalDisplayLinesAtom,
  logModalIsAtBottomAtom,
  logModalOpenAtom,
  quickPanelOpenAtom,
  selectedPaneIdAtom,
} from "../atoms/logAtoms";
import {
  getScreenCacheAtom,
  getScreenCacheErrorAtom,
  getScreenCacheLoadingAtom,
} from "../atoms/screenCacheAtoms";
import { createSessionDetail } from "../test-helpers";
import { useSessionLogs } from "./useSessionLogs";

vi.mock("@/lib/ansi", () => ({
  renderAnsiLines: (text: string) => text.split("\n"),
}));

describe("useSessionLogs", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  const createWrapper = () => {
    const store = createStore();
    store.set(quickPanelOpenAtom, false);
    store.set(logModalOpenAtom, false);
    store.set(logModalIsAtBottomAtom, true);
    store.set(logModalDisplayLinesAtom, []);
    store.set(selectedPaneIdAtom, null);
    store.set(getScreenCacheAtom("logs"), {});
    store.set(getScreenCacheLoadingAtom("logs"), {});
    store.set(getScreenCacheErrorAtom("logs"), {});
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  it("opens log modal and loads log lines", async () => {
    const session = createSessionDetail();
    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: session.paneId,
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "line1\nline2",
    });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [session],
          requestScreen,
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    act(() => {
      result.current.toggleQuickPanel();
    });
    act(() => {
      result.current.openLogModal(session.paneId);
    });

    await waitFor(() => {
      expect(result.current.selectedLogLines.length).toBe(2);
    });

    expect(requestScreen).toHaveBeenCalledWith(session.paneId, { mode: "text" });
  });

  it("linkifies http/https URLs in selected log lines", async () => {
    const session = createSessionDetail();
    const requestScreen = vi.fn().mockResolvedValue({
      ok: true,
      paneId: session.paneId,
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "see https://example.com/docs\nplain line",
    });

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [session],
          requestScreen,
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    act(() => {
      result.current.openLogModal(session.paneId);
    });

    await waitFor(() => {
      expect(result.current.selectedLogLines.length).toBe(2);
    });

    const doc = new DOMParser().parseFromString(
      `<div>${result.current.selectedLogLines[0] ?? ""}</div>`,
      "text/html",
    );
    const link = doc.querySelector<HTMLAnchorElement>("a[data-vde-log-url]");
    expect(link?.getAttribute("href")).toBe("https://example.com/docs");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(result.current.selectedLogLines[1]).toBe("plain line");
  });

  it("toggles quick panel state", () => {
    const session = createSessionDetail();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [session],
          requestScreen: vi.fn(),
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    expect(result.current.quickPanelOpen).toBe(false);
    act(() => {
      result.current.toggleQuickPanel();
    });
    expect(result.current.quickPanelOpen).toBe(true);
  });

  it("opens log modal without quick panel", () => {
    const session = createSessionDetail();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [session],
          requestScreen: vi.fn().mockResolvedValue({
            ok: true,
            paneId: session.paneId,
            mode: "text",
            capturedAt: new Date(0).toISOString(),
            screen: "line1",
          }),
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    act(() => {
      result.current.openLogModal(session.paneId);
    });

    expect(result.current.logModalOpen).toBe(true);
  });

  it("closes log modal when quick panel closes", async () => {
    const session = createSessionDetail();
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [session],
          requestScreen: vi.fn().mockResolvedValue({
            ok: true,
            paneId: session.paneId,
            mode: "text",
            capturedAt: new Date(0).toISOString(),
            screen: "line1",
          }),
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    act(() => {
      result.current.toggleQuickPanel();
    });
    act(() => {
      result.current.openLogModal(session.paneId);
    });

    expect(result.current.logModalOpen).toBe(true);

    act(() => {
      result.current.toggleQuickPanel();
    });

    expect(result.current.quickPanelOpen).toBe(false);
    await waitFor(() => {
      expect(result.current.logModalOpen).toBe(false);
    });
  });

  it("keeps log cache when switching selected pane", async () => {
    const sessionA = createSessionDetail({ paneId: "pane-1" });
    const sessionB = createSessionDetail({ paneId: "pane-2" });
    const store = createStore();
    store.set(quickPanelOpenAtom, false);
    store.set(logModalOpenAtom, false);
    store.set(logModalIsAtBottomAtom, true);
    store.set(logModalDisplayLinesAtom, []);
    store.set(selectedPaneIdAtom, null);
    store.set(getScreenCacheAtom("logs"), {
      "pane-1": {
        screen: "line1",
        capturedAt: new Date(0).toISOString(),
        updatedAt: Date.now(),
      },
      "pane-2": {
        screen: "line2",
        capturedAt: new Date(0).toISOString(),
        updatedAt: Date.now(),
      },
    });
    store.set(getScreenCacheLoadingAtom("logs"), {});
    store.set(getScreenCacheErrorAtom("logs"), {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [sessionA, sessionB],
          requestScreen: vi.fn().mockResolvedValue({
            ok: true,
            paneId: "pane-1",
            mode: "text",
            capturedAt: new Date(0).toISOString(),
            screen: "line1",
          }),
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    act(() => {
      result.current.openLogModal("pane-1");
    });
    act(() => {
      result.current.openLogModal("pane-2");
    });

    await waitFor(() => {
      const cache = store.get(getScreenCacheAtom("logs"));
      expect(cache["pane-1"]).toBeDefined();
      expect(cache["pane-2"]).toBeDefined();
    });
  });

  it("renders cached logs immediately when opening after navigation", async () => {
    const session = createSessionDetail({ paneId: "pane-1" });
    const requestScreen = vi.fn(() => new Promise<ScreenResponse>(() => {}));
    const store = createStore();
    store.set(quickPanelOpenAtom, false);
    store.set(logModalOpenAtom, true);
    store.set(logModalIsAtBottomAtom, true);
    store.set(logModalDisplayLinesAtom, []);
    store.set(selectedPaneIdAtom, "pane-1");
    store.set(getScreenCacheAtom("logs"), {
      "pane-1": {
        screen: "cached1\ncached2",
        capturedAt: new Date(0).toISOString(),
        updatedAt: Date.now(),
      },
    });
    store.set(getScreenCacheLoadingAtom("logs"), {});
    store.set(getScreenCacheErrorAtom("logs"), {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    const { result } = renderHook(
      () =>
        useSessionLogs({
          connected: true,
          connectionIssue: null,
          sessions: [session],
          requestScreen,
          resolvedTheme: "latte",
        }),
      { wrapper },
    );

    expect(result.current.selectedLogLines).toEqual(["cached1", "cached2"]);
  });
});
