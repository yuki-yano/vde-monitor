// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RepoNote } from "@vde-monitor/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "@/lib/copy-to-clipboard";

import { NotesSection } from "./NotesSection";

vi.mock("@/lib/copy-to-clipboard", () => ({
  copyToClipboard: vi.fn(async () => true),
}));

type NotesSectionState = Parameters<typeof NotesSection>[0]["state"];
type NotesSectionActions = Parameters<typeof NotesSection>[0]["actions"];

const createNote = (overrides: Partial<RepoNote> = {}): RepoNote => ({
  id: "note-1",
  repoRoot: "/repo",
  title: null,
  body: "line-1\nline-2",
  createdAt: "2026-02-10T00:00:00.000Z",
  updatedAt: "2026-02-10T00:00:00.000Z",
  ...overrides,
});

const buildState = (overrides: Partial<NotesSectionState> = {}): NotesSectionState => ({
  repoRoot: "/repo",
  notes: [createNote()],
  notesLoading: false,
  notesError: null,
  creatingNote: false,
  savingNoteId: null,
  deletingNoteId: null,
  ...overrides,
});

const buildActions = (overrides: Partial<NotesSectionActions> = {}): NotesSectionActions => ({
  onRefresh: vi.fn(),
  onCreate: vi.fn(async () => true),
  onSave: vi.fn(async () => true),
  onDelete: vi.fn(async () => true),
  ...overrides,
});

describe("NotesSection", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(copyToClipboard).mockResolvedValue(true);
  });

  it("adds an empty note from header add button", async () => {
    const onCreate = vi.fn(async () => true);
    const actions = buildActions({ onCreate });
    const { rerender } = render(
      <NotesSection state={buildState({ notes: [] })} actions={actions} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({ title: null, body: "" });
    });

    rerender(
      <NotesSection
        state={buildState({
          notes: [createNote({ id: "new-note", body: "" })],
        })}
        actions={actions}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Collapse note new-note" })).toBeTruthy();
    });
    expect(screen.getByLabelText("Edit note body new-note")).toBeTruthy();
  });

  it("refreshes on mount and auto-syncs every 10 seconds", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    render(<NotesSection state={buildState()} actions={buildActions({ onRefresh })} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledWith({ silent: true });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(onRefresh).toHaveBeenNthCalledWith(2, { silent: true });
  });

  it("asks for confirmation dialog before deleting a note", async () => {
    const onDelete = vi.fn(async () => true);
    render(<NotesSection state={buildState()} actions={buildActions({ onDelete })} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete note note-1" }));
    expect(screen.getByText("Delete note?")).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete note?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete note note-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("note-1");
    });
  });

  it("auto-saves edited note body with debounce", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => true);
    render(<NotesSection state={buildState()} actions={buildActions({ onSave })} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand note note-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Start editing note note-1" }));
    fireEvent.change(screen.getByLabelText("Edit note body note-1"), {
      target: { value: "updated body" },
    });

    await act(async () => {
      vi.advanceTimersByTime(699);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith("note-1", { title: null, body: "updated body" });
  });

  it("shows first-line preview and full text when expanded", async () => {
    render(<NotesSection state={buildState()} actions={buildActions()} />);

    const expandButton = screen.getByRole("button", { name: "Expand note note-1" });
    const collapsedPreview = expandButton.querySelector("p");
    expect(collapsedPreview?.className).toContain("truncate");
    expect(collapsedPreview?.textContent).toBe("line-1");

    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByText(/line-1\s+line-2/u)).toBeTruthy();
    });

    const collapseButton = screen.getByRole("button", { name: "Collapse note note-1" });
    const openPreview = collapseButton.querySelector("p");
    expect(openPreview?.className).toContain("truncate");
    expect(openPreview?.textContent).toBe("line-1");
  });

  it("starts editing on body click and exits edit mode on blur", async () => {
    render(<NotesSection state={buildState()} actions={buildActions()} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand note note-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Start editing note note-1" }));

    const textarea = screen.getByLabelText("Edit note body note-1");
    expect(textarea).toBeTruthy();

    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.queryByLabelText("Edit note body note-1")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Start editing note note-1" })).toBeTruthy();
  });

  it("moves caret to end when entering edit mode", async () => {
    render(<NotesSection state={buildState()} actions={buildActions()} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand note note-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Start editing note note-1" }));

    const textarea = screen.getByLabelText("Edit note body note-1") as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.selectionStart).toBe(textarea.value.length);
      expect(textarea.selectionEnd).toBe(textarea.value.length);
    });
  });

  it("shows copied hint briefly after copy", async () => {
    vi.useFakeTimers();
    const mockedCopyToClipboard = vi.mocked(copyToClipboard);
    mockedCopyToClipboard.mockResolvedValueOnce(true);
    render(<NotesSection state={buildState()} actions={buildActions()} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy note note-1" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedCopyToClipboard).toHaveBeenCalledWith("line-1\nline-2");
    expect(screen.getByText("Copied")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    expect(screen.queryByText("Copied")).toBeNull();
  });
});
