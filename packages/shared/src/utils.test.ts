import type { RepoNote } from "./types";

import { describe, expect, it } from "vitest";

import { dedupeStrings, isObject, sortNotesDesc } from "./utils";

const createNote = (overrides: Partial<RepoNote>): RepoNote => ({
  id: "note-1",
  repoRoot: "/repo",
  title: null,
  body: "body",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("utils", () => {
  it("dedupeStrings keeps first occurrence order", () => {
    expect(dedupeStrings(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("isObject returns true only for non-null objects", () => {
    expect(isObject({ key: "value" })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject("text")).toBe(false);
    expect(isObject(123)).toBe(false);
  });

  it("sortNotesDesc orders by updatedAt descending", () => {
    const older = createNote({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = createNote({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" });
    expect(sortNotesDesc([older, newer]).map((note) => note.id)).toEqual(["b", "a"]);
  });

  it("sortNotesDesc breaks same-instant ties by updatedAt string", () => {
    const plain = createNote({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" });
    const offset = createNote({ id: "b", updatedAt: "2026-01-01T09:00:00.000+09:00" });
    expect(sortNotesDesc([offset, plain]).map((note) => note.id)).toEqual(["b", "a"]);
  });

  it("sortNotesDesc breaks full ties by id descending", () => {
    const first = createNote({ id: "a" });
    const second = createNote({ id: "b" });
    expect(sortNotesDesc([first, second]).map((note) => note.id)).toEqual(["b", "a"]);
  });
});
