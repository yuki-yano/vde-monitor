import { act, renderHook } from "@testing-library/react";
import type { RepoNote } from "@vde-monitor/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNoteAutoSave } from "./useNoteAutoSave";

const buildNote = (overrides: Partial<RepoNote> = {}): RepoNote => ({
  id: "note-1",
  repoRoot: "/repo",
  title: null,
  body: "original body",
  createdAt: "2026-02-10T00:00:00.000Z",
  updatedAt: "2026-02-10T00:00:00.000Z",
  ...overrides,
});

describe("useNoteAutoSave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save until 700ms after the last body change, then saves once", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });

    act(() => {
      result.current.setEditingBody("updated");
    });

    await act(async () => {
      vi.advanceTimersByTime(699);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("note-1", { title: null, body: "updated" });
  });

  it("collapses rapid edits into a single save using the latest body", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });

    act(() => {
      result.current.setEditingBody("first");
      vi.advanceTimersByTime(400);
      result.current.setEditingBody("second");
      vi.advanceTimersByTime(400);
      result.current.setEditingBody("third");
    });

    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("note-1", { title: null, body: "third" });
  });

  it("does not arm a save when the body matches the last saved body", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });

    act(() => {
      result.current.setEditingBody(note.body);
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("flushes a pending save immediately (bypassing the debounce) on finishEdit", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });
    act(() => {
      result.current.setEditingBody("flushed body");
    });

    await act(async () => {
      await result.current.finishEdit();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("note-1", { title: null, body: "flushed body" });
    expect(result.current.editingNoteId).toBeNull();
    expect(result.current.editingBody).toBe("");
  });

  it("flushes the previous note's pending edit before switching via beginEdit", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const noteA = buildNote({ id: "note-a", body: "a-body" });
    const noteB = buildNote({ id: "note-b", body: "b-body" });
    const { result } = renderHook(() => useNoteAutoSave({ notes: [noteA, noteB], onSave }));

    await act(async () => {
      await result.current.beginEdit(noteA);
    });
    act(() => {
      result.current.setEditingBody("a-draft");
    });

    await act(async () => {
      await result.current.beginEdit(noteB);
    });

    expect(onSave).toHaveBeenCalledWith("note-a", { title: null, body: "a-draft" });
    expect(result.current.editingNoteId).toBe("note-b");
    expect(result.current.editingBody).toBe("b-body");
  });

  it("keeps editing the current note when the flush save fails during a switch", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => false);
    const noteA = buildNote({ id: "note-a", body: "a-body" });
    const noteB = buildNote({ id: "note-b", body: "b-body" });
    const { result } = renderHook(() => useNoteAutoSave({ notes: [noteA, noteB], onSave }));

    await act(async () => {
      await result.current.beginEdit(noteA);
    });
    act(() => {
      result.current.setEditingBody("a-draft");
    });

    let switched = true;
    await act(async () => {
      switched = await result.current.beginEdit(noteB);
    });

    expect(switched).toBe(false);
    expect(result.current.editingNoteId).toBe("note-a");
    expect(result.current.editingBody).toBe("a-draft");
  });

  it("serializes auto-save requests while a previous save is in flight", async () => {
    vi.useFakeTimers();
    const createDeferred = () => {
      let resolve: (value: boolean) => void = () => {};
      const promise = new Promise<boolean>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const first = createDeferred();
    const second = createDeferred();
    const onSave =
      vi.fn<(noteId: string, input: { title: string | null; body: string }) => Promise<boolean>>();
    onSave.mockImplementationOnce(() => first.promise);
    onSave.mockImplementationOnce(() => second.promise);
    const note = buildNote();
    const { result } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });
    act(() => {
      result.current.setEditingBody("first");
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setEditingBody("second");
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });
    // Second debounce fired, but the save is queued behind the first (still in flight).
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, "note-1", { title: null, body: "second" });

    await act(async () => {
      second.resolve(true);
      await Promise.resolve();
    });
  });

  it("discards a pending edit without saving when the note is deleted", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });
    act(() => {
      result.current.setEditingBody("about to be deleted");
    });

    act(() => {
      result.current.discardEditing("note-1");
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.editingNoteId).toBeNull();
  });

  it("guardToggleClose flushes and clears editing only when the target note matches", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const noteA = buildNote({ id: "note-a" });
    const noteB = buildNote({ id: "note-b" });
    const { result } = renderHook(() => useNoteAutoSave({ notes: [noteA, noteB], onSave }));

    await act(async () => {
      await result.current.beginEdit(noteA);
    });
    act(() => {
      result.current.setEditingBody("a-draft");
    });

    let okForOther = false;
    await act(async () => {
      okForOther = await result.current.guardToggleClose("note-b");
    });
    expect(okForOther).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.editingNoteId).toBe("note-a");

    let okForCurrent = false;
    await act(async () => {
      okForCurrent = await result.current.guardToggleClose("note-a");
    });
    expect(okForCurrent).toBe(true);
    expect(onSave).toHaveBeenCalledWith("note-a", { title: null, body: "a-draft" });
    expect(result.current.editingNoteId).toBeNull();
  });

  it("forceStartEditing switches directly without flushing a previous pending edit", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const noteA = buildNote({ id: "note-a", body: "a-body" });
    const noteB = buildNote({ id: "note-b", body: "b-body" });
    const { result } = renderHook(() => useNoteAutoSave({ notes: [noteA, noteB], onSave }));

    await act(async () => {
      await result.current.beginEdit(noteA);
    });
    act(() => {
      result.current.setEditingBody("a-draft");
    });

    act(() => {
      result.current.forceStartEditing(noteB);
    });

    expect(result.current.editingNoteId).toBe("note-b");
    expect(result.current.editingBody).toBe("b-body");

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // The switch happened without flushing note-a's draft.
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears the editing state when the currently edited note disappears from the list", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result, rerender } = renderHook(
      ({ notes }: { notes: RepoNote[] }) => useNoteAutoSave({ notes, onSave }),
      { initialProps: { notes: [note] } },
    );

    await act(async () => {
      await result.current.beginEdit(note);
    });
    expect(result.current.editingNoteId).toBe("note-1");

    act(() => {
      rerender({ notes: [] });
    });

    expect(result.current.editingNoteId).toBeNull();
  });

  it("does not fire a save after unmount", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    const note = buildNote();
    const { result, unmount } = renderHook(() => useNoteAutoSave({ notes: [note], onSave }));

    await act(async () => {
      await result.current.beginEdit(note);
    });
    act(() => {
      result.current.setEditingBody("never saved");
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
