import type { SessionDetail } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { createRepoNotesService } from "./service";

const createNote = (id: string) => ({
  id,
  repoRoot: "/repo/a",
  title: null,
  body: "body",
  createdAt: "2026-02-10T00:00:00.000Z",
  updatedAt: "2026-02-10T00:00:00.000Z",
});

describe("repo-notes service", () => {
  it("returns null when pane has no repo root", () => {
    const service = createRepoNotesService({
      registry: {
        getDetail: () => ({ repoRoot: null } as unknown as SessionDetail),
      },
      repoNotes: {
        list: vi.fn(() => []),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      savePersistedState: vi.fn(),
    });

    expect(service.listByPane("pane-1")).toBeNull();
    expect(service.createByPane("pane-1", { body: "x" })).toBeNull();
    expect(service.updateByPane("pane-1", "note-1", { body: "x" })).toBeNull();
    expect(service.deleteByPane("pane-1", "note-1")).toBeNull();
  });

  it("persists only when create/update/delete mutate notes", () => {
    const savePersistedState = vi.fn();
    const service = createRepoNotesService({
      registry: {
        getDetail: () => ({ repoRoot: "/repo/a" } as unknown as SessionDetail),
      },
      repoNotes: {
        list: vi.fn(() => [createNote("note-1")]),
        create: vi.fn(() => createNote("note-2")),
        update: vi.fn((_repoRoot: string, noteId: string) =>
          noteId === "note-1" ? createNote("note-1") : null,
        ),
        remove: vi.fn((_repoRoot: string, noteId: string) => noteId === "note-1"),
      },
      savePersistedState,
    });

    expect(service.listByPane("pane-1")?.map((note) => note.id)).toEqual(["note-1"]);
    expect(service.createByPane("pane-1", { body: "created" })?.id).toBe("note-2");
    expect(service.updateByPane("pane-1", "missing", { body: "updated" })).toBeNull();
    expect(service.updateByPane("pane-1", "note-1", { body: "updated" })?.id).toBe("note-1");
    expect(service.deleteByPane("pane-1", "missing")).toBe(false);
    expect(service.deleteByPane("pane-1", "note-1")).toBe(true);

    expect(savePersistedState).toHaveBeenCalledTimes(3);
  });
});
