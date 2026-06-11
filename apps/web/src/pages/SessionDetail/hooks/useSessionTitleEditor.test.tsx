import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSessionDetail } from "../test-helpers";
import { useSessionTitleEditor } from "./useSessionTitleEditor";

describe("useSessionTitleEditor", () => {
  it("initializes with custom title", () => {
    const session = createSessionDetail({ customTitle: "Custom" });
    const { result } = renderHook(() =>
      useSessionTitleEditor({
        session,
        paneId: session.paneId,
        updateSessionTitle: vi.fn(),
        resetSessionTitle: vi.fn(),
      }),
    );

    expect(result.current.titleDraft).toBe("Custom");
    expect(result.current.titleEditing).toBe(false);
  });

  it("opens editor and saves trimmed title", async () => {
    const session = createSessionDetail({ customTitle: "Custom" });
    const updateSessionTitle = vi.fn().mockResolvedValue(undefined);
    const resetSessionTitle = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSessionTitleEditor({
        session,
        paneId: session.paneId,
        updateSessionTitle,
        resetSessionTitle,
      }),
    );

    act(() => {
      result.current.openTitleEditor();
      result.current.updateTitleDraft("  Updated Title  ");
    });

    await act(async () => {
      await result.current.saveTitle();
    });

    expect(updateSessionTitle).toHaveBeenCalledWith(session.paneId, "Updated Title");
    expect(result.current.titleEditing).toBe(false);
  });

  it("validates title length", async () => {
    const session = createSessionDetail();
    const updateSessionTitle = vi.fn().mockResolvedValue(undefined);
    const resetSessionTitle = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSessionTitleEditor({
        session,
        paneId: session.paneId,
        updateSessionTitle,
        resetSessionTitle,
      }),
    );

    act(() => {
      result.current.updateTitleDraft("a".repeat(81));
    });

    await act(async () => {
      await result.current.saveTitle();
    });

    expect(updateSessionTitle).not.toHaveBeenCalled();
    expect(result.current.titleError).toBe("Title must be 80 characters or less.");
  });

  it("resets custom title", async () => {
    const session = createSessionDetail({ customTitle: "Custom Title" });
    const updateSessionTitle = vi.fn().mockResolvedValue(undefined);
    const resetSessionTitle = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSessionTitleEditor({
        session,
        paneId: session.paneId,
        updateSessionTitle,
        resetSessionTitle,
      }),
    );

    await act(async () => {
      await result.current.resetTitle();
    });

    expect(resetSessionTitle).toHaveBeenCalledWith(session.paneId);
    expect(updateSessionTitle).not.toHaveBeenCalled();
  });

  it("resets title when custom title is not set", async () => {
    const session = createSessionDetail({ customTitle: null, title: "✳ Initial Greeting" });
    const updateSessionTitle = vi.fn().mockResolvedValue(undefined);
    const resetSessionTitle = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSessionTitleEditor({
        session,
        paneId: session.paneId,
        updateSessionTitle,
        resetSessionTitle,
      }),
    );

    await act(async () => {
      await result.current.resetTitle();
    });

    expect(resetSessionTitle).toHaveBeenCalledWith(session.paneId);
    expect(updateSessionTitle).not.toHaveBeenCalled();
  });
});
