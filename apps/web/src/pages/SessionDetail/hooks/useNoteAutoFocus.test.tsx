import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { RepoNote } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { useNoteAutoFocus } from "./useNoteAutoFocus";

const buildNote = (overrides: Partial<RepoNote> = {}): RepoNote => ({
  id: "note-1",
  repoRoot: "/repo",
  title: null,
  body: "hello world",
  createdAt: "2026-02-10T00:00:00.000Z",
  updatedAt: "2026-02-10T00:00:00.000Z",
  ...overrides,
});

describe("useNoteAutoFocus - new note detection", () => {
  it("does not report a newly appeared note unless auto-edit is pending", () => {
    const onAutoEdit = vi.fn();
    const noteA = buildNote({ id: "note-a" });
    const { rerender } = renderHook(
      ({ notes }: { notes: RepoNote[] }) =>
        useNoteAutoFocus({ notes, editingNoteId: null, onAutoEdit }),
      { initialProps: { notes: [noteA] } },
    );

    rerender({ notes: [noteA, buildNote({ id: "note-b" })] });

    expect(onAutoEdit).not.toHaveBeenCalled();
  });

  it("reports the note created after markPendingAutoEdit and consumes the flag", () => {
    const onAutoEdit = vi.fn();
    const noteA = buildNote({ id: "note-a" });
    const { result, rerender } = renderHook(
      ({ notes }: { notes: RepoNote[] }) =>
        useNoteAutoFocus({ notes, editingNoteId: null, onAutoEdit }),
      { initialProps: { notes: [noteA] } },
    );

    act(() => {
      result.current.markPendingAutoEdit();
    });

    const noteB = buildNote({ id: "note-b" });
    rerender({ notes: [noteA, noteB] });

    expect(onAutoEdit).toHaveBeenCalledTimes(1);
    expect(onAutoEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "note-b" }));

    // The flag is consumed: a further new note does not re-trigger without re-arming.
    rerender({ notes: [noteA, noteB, buildNote({ id: "note-c" })] });
    expect(onAutoEdit).toHaveBeenCalledTimes(1);
  });

  it("cancelPendingAutoEdit suppresses the pending detection", () => {
    const onAutoEdit = vi.fn();
    const noteA = buildNote({ id: "note-a" });
    const { result, rerender } = renderHook(
      ({ notes }: { notes: RepoNote[] }) =>
        useNoteAutoFocus({ notes, editingNoteId: null, onAutoEdit }),
      { initialProps: { notes: [noteA] } },
    );

    act(() => {
      result.current.markPendingAutoEdit();
      result.current.cancelPendingAutoEdit();
    });

    rerender({ notes: [noteA, buildNote({ id: "note-b" })] });

    expect(onAutoEdit).not.toHaveBeenCalled();
  });
});

type HarnessProps = {
  editingNoteId: string | null;
};

const Harness = ({ editingNoteId }: HarnessProps) => {
  const { editingTextareaRef } = useNoteAutoFocus({
    notes: [],
    editingNoteId,
    onAutoEdit: () => {},
  });
  return editingNoteId ? (
    <textarea aria-label="editor" ref={editingTextareaRef} defaultValue="hello world" />
  ) : null;
};

describe("useNoteAutoFocus - caret restore", () => {
  it("focuses the textarea and moves the caret to the end when editing starts", async () => {
    const { rerender } = render(<Harness editingNoteId={null} />);
    expect(screen.queryByLabelText("editor")).toBeNull();

    rerender(<Harness editingNoteId="note-1" />);

    const textarea = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
      expect(textarea.selectionStart).toBe(textarea.value.length);
      expect(textarea.selectionEnd).toBe(textarea.value.length);
    });
  });
});
