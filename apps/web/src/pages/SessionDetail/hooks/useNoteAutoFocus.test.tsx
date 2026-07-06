import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useNoteAutoFocus } from "./useNoteAutoFocus";

type HarnessProps = {
  editingNoteId: string | null;
};

const Harness = ({ editingNoteId }: HarnessProps) => {
  const { editingTextareaRef } = useNoteAutoFocus({
    editingNoteId,
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
