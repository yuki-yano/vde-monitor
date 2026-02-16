// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { RepoNote } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { createDeferred } from "../test-helpers";
import { useSessionRepoNotes } from "./useSessionRepoNotes";

const buildNote = (overrides: Partial<RepoNote> = {}): RepoNote => ({
  id: "note-1",
  repoRoot: "/repo",
  title: null,
  body: "body",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});

const createDefaultActions = () => ({
  createRepoNote: vi.fn(async () => buildNote({ id: "created-note" })),
  updateRepoNote: vi.fn(async () => buildNote({ id: "updated-note" })),
  deleteRepoNote: vi.fn(async () => "deleted-note"),
});

describe("useSessionRepoNotes", () => {
  it("keeps loading false during silent refresh", async () => {
    const initialNotes = [buildNote({ id: "initial-note" })];
    const silentDeferred = createDeferred<RepoNote[]>();
    const requestRepoNotes = vi
      .fn()
      .mockResolvedValueOnce(initialNotes)
      .mockImplementationOnce(() => silentDeferred.promise);
    const { createRepoNote, updateRepoNote, deleteRepoNote } = createDefaultActions();

    const { result } = renderHook(() =>
      useSessionRepoNotes({
        paneId: "pane-1",
        repoRoot: "/repo",
        connected: true,
        requestRepoNotes,
        createRepoNote,
        updateRepoNote,
        deleteRepoNote,
      }),
    );

    await waitFor(() => {
      expect(requestRepoNotes).toHaveBeenCalledTimes(1);
      expect(result.current.notesLoading).toBe(false);
    });

    act(() => {
      result.current.refreshNotes({ silent: true });
    });

    await waitFor(() => {
      expect(requestRepoNotes).toHaveBeenCalledTimes(2);
      expect(result.current.notesLoading).toBe(false);
    });

    act(() => {
      silentDeferred.resolve([buildNote({ id: "silent-note" })]);
    });

    await waitFor(() => {
      expect(result.current.notes[0]?.id).toBe("silent-note");
    });
  });

  it("clears loading when interactive refresh becomes stale after reconnect refresh", async () => {
    const initialNotes = [buildNote({ id: "initial-note" })];
    const refreshDeferred = createDeferred<RepoNote[]>();
    const reconnectDeferred = createDeferred<RepoNote[]>();
    const requestRepoNotes = vi
      .fn()
      .mockResolvedValueOnce(initialNotes)
      .mockImplementationOnce(() => refreshDeferred.promise)
      .mockImplementationOnce(() => reconnectDeferred.promise);
    const { createRepoNote, updateRepoNote, deleteRepoNote } = createDefaultActions();

    const { result, rerender } = renderHook(
      ({ connected }) =>
        useSessionRepoNotes({
          paneId: "pane-1",
          repoRoot: "/repo",
          connected,
          requestRepoNotes,
          createRepoNote,
          updateRepoNote,
          deleteRepoNote,
        }),
      { initialProps: { connected: false } },
    );

    await waitFor(() => {
      expect(requestRepoNotes).toHaveBeenCalledTimes(1);
      expect(result.current.notesLoading).toBe(false);
    });

    act(() => {
      result.current.refreshNotes();
    });

    await waitFor(() => {
      expect(requestRepoNotes).toHaveBeenCalledTimes(2);
      expect(result.current.notesLoading).toBe(true);
    });

    rerender({ connected: true });

    await waitFor(() => {
      expect(requestRepoNotes).toHaveBeenCalledTimes(3);
    });

    act(() => {
      refreshDeferred.resolve([buildNote({ id: "refresh-note" })]);
    });

    await waitFor(() => {
      expect(result.current.notesLoading).toBe(false);
    });

    act(() => {
      reconnectDeferred.resolve([buildNote({ id: "reconnect-note" })]);
    });

    await waitFor(() => {
      expect(result.current.notes[0]?.id).toBe("reconnect-note");
    });
  });
});
