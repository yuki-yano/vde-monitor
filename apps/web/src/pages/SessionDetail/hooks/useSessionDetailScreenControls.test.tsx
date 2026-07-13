import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { initialScreenLoadingState } from "@/lib/screen-loading";

import {
  controlsAllowDangerKeysAtom,
  controlsAutoEnterAtom,
  controlsCtrlHeldAtom,
  controlsRawModeAtom,
  controlsShiftHeldAtom,
} from "../atoms/controlAtoms";
import {
  screenErrorAtom,
  screenFallbackReasonAtom,
  screenImageAtom,
  screenLoadingAtom,
  screenModeAtom,
  screenModeLoadedAtom,
  screenTextAtom,
} from "../atoms/screenAtoms";
import { useSessionDetailScreenControls } from "./useSessionDetailScreenControls";

vi.mock("@/lib/ansi", () => ({
  renderAnsiLines: (text: string) => text.split("\n"),
}));

describe("useSessionDetailScreenControls", () => {
  // This is the actual composition point of useSessionScreen's shared
  // screenError and useSessionControls' dedicated send-error state, so the
  // cross-hook contract from Task F2 (send errors and connection/screen-fetch
  // errors are independent) is verified here rather than in either hook's
  // isolated unit tests.
  const createWrapper = () => {
    const store = createStore();
    store.set(controlsAutoEnterAtom, true);
    store.set(controlsShiftHeldAtom, false);
    store.set(controlsCtrlHeldAtom, false);
    store.set(controlsRawModeAtom, false);
    store.set(controlsAllowDangerKeysAtom, false);
    store.set(screenModeAtom, "text");
    store.set(screenModeLoadedAtom, { text: false, image: false });
    store.set(screenTextAtom, "");
    store.set(screenImageAtom, null);
    store.set(screenFallbackReasonAtom, null);
    store.set(screenErrorAtom, null);
    store.set(screenLoadingAtom, initialScreenLoadingState);
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  const buildArgs = (
    overrides: Partial<Parameters<typeof useSessionDetailScreenControls>[0]> = {},
  ) => ({
    paneId: "pane-1",
    connected: true,
    connectionIssue: null,
    resolvedTheme: "mocha" as const,
    sessionAgent: "codex",
    highlightCorrections: { codex: true, claude: true },
    requestScreen: vi.fn().mockResolvedValue({
      ok: true,
      paneId: "pane-1",
      mode: "text",
      capturedAt: new Date(0).toISOString(),
      screen: "hello",
    }),
    sendText: vi.fn().mockResolvedValue({ ok: true }),
    sendKeys: vi.fn().mockResolvedValue({ ok: true }),
    sendRaw: vi.fn().mockResolvedValue({ ok: true }),
    killPane: vi.fn().mockResolvedValue({ ok: true }),
    killWindow: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  });

  it("keeps the disconnected screen error stationary after a successful key send", async () => {
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = createWrapper();
    const { result } = renderHook(
      () => useSessionDetailScreenControls(buildArgs({ connected: false, sendKeys })),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.screen.error).toBe("Disconnected. Reconnecting...");
    });

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(result.current.screen.error).toBe("Disconnected. Reconnecting...");
    expect(result.current.controls.sendError).toBeNull();
  });

  it("keeps a screen-fetch error stationary after a successful key send", async () => {
    const requestScreen = vi.fn().mockRejectedValue(new Error("network down"));
    const sendKeys = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = createWrapper();
    const { result } = renderHook(
      () => useSessionDetailScreenControls(buildArgs({ requestScreen, sendKeys })),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.screen.error).toBe("network down");
    });

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(result.current.screen.error).toBe("network down");
    expect(result.current.controls.sendError).toBeNull();
  });

  it("surfaces a key send failure via controls.sendError without touching the screen error, then clears it on a successful retry", async () => {
    const sendKeys = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "boom" } })
      .mockResolvedValueOnce({ ok: true });
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSessionDetailScreenControls(buildArgs({ sendKeys })), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.screen.error).toBeNull();
    });

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(result.current.controls.sendError).toBe("boom");
    expect(result.current.screen.error).toBeNull();

    await act(async () => {
      await result.current.controls.handleSendKey("Enter");
    });

    expect(result.current.controls.sendError).toBeNull();
    expect(result.current.screen.error).toBeNull();
  });
});
