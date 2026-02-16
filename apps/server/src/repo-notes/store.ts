import { randomUUID } from "node:crypto";

import type { RepoNote } from "@vde-monitor/shared";

export type PersistedRepoNote = RepoNote;
export type PersistedRepoNotesRecord = Record<string, PersistedRepoNote[]>;

type CreateRepoNoteInput = {
  title?: string | null;
  body: string;
};

type UpdateRepoNoteInput = {
  title?: string | null;
  body: string;
};

type StoreOptions = {
  now?: () => string;
  createId?: () => string;
};

const normalizeTitle = (title: string | null | undefined) => {
  if (title == null) {
    return null;
  }
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sortNotesDesc = (notes: RepoNote[]) =>
  [...notes].sort((a, b) => {
    const updatedAtDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.id.localeCompare(a.id);
  });

const cloneRepoNote = (note: RepoNote): RepoNote => ({ ...note });

const isRepoNote = (value: unknown): value is RepoNote => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const note = value as Partial<RepoNote>;
  return (
    typeof note.id === "string" &&
    typeof note.repoRoot === "string" &&
    (note.title == null || typeof note.title === "string") &&
    typeof note.body === "string" &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string"
  );
};

export const createRepoNotesStore = (options: StoreOptions = {}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => randomUUID());
  const notesByRepoRoot = new Map<string, RepoNote[]>();

  const list = (repoRoot: string): RepoNote[] => {
    const notes = notesByRepoRoot.get(repoRoot) ?? [];
    return sortNotesDesc(notes).map(cloneRepoNote);
  };

  const create = (repoRoot: string, input: CreateRepoNoteInput): RepoNote => {
    const timestamp = now();
    const note: RepoNote = {
      id: createId(),
      repoRoot,
      title: normalizeTitle(input.title),
      body: input.body,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const current = notesByRepoRoot.get(repoRoot) ?? [];
    notesByRepoRoot.set(repoRoot, sortNotesDesc([note, ...current]));
    return cloneRepoNote(note);
  };

  const update = (
    repoRoot: string,
    noteId: string,
    input: UpdateRepoNoteInput,
  ): RepoNote | null => {
    const current = notesByRepoRoot.get(repoRoot);
    if (!current || current.length === 0) {
      return null;
    }
    const index = current.findIndex((note) => note.id === noteId);
    if (index < 0) {
      return null;
    }
    const existing = current[index];
    if (!existing) {
      return null;
    }
    const timestamp = now();
    const updated: RepoNote = {
      ...existing,
      title: normalizeTitle(input.title),
      body: input.body,
      updatedAt: timestamp,
    };
    const next = [...current];
    next[index] = updated;
    notesByRepoRoot.set(repoRoot, sortNotesDesc(next));
    return cloneRepoNote(updated);
  };

  const remove = (repoRoot: string, noteId: string): boolean => {
    const current = notesByRepoRoot.get(repoRoot);
    if (!current || current.length === 0) {
      return false;
    }
    const next = current.filter((note) => note.id !== noteId);
    if (next.length === current.length) {
      return false;
    }
    if (next.length === 0) {
      notesByRepoRoot.delete(repoRoot);
      return true;
    }
    notesByRepoRoot.set(repoRoot, sortNotesDesc(next));
    return true;
  };

  const serialize = (): PersistedRepoNotesRecord => {
    const output: PersistedRepoNotesRecord = {};
    notesByRepoRoot.forEach((notes, repoRoot) => {
      if (notes.length > 0) {
        output[repoRoot] = notes.map(cloneRepoNote);
      }
    });
    return output;
  };

  const restore = (
    persisted: PersistedRepoNotesRecord | Map<string, PersistedRepoNote[]> | null | undefined,
  ) => {
    notesByRepoRoot.clear();
    if (!persisted) {
      return;
    }
    const entries =
      persisted instanceof Map ? Array.from(persisted.entries()) : Object.entries(persisted);
    for (const [repoRoot, notes] of entries) {
      if (!repoRoot || !Array.isArray(notes)) {
        continue;
      }
      const sanitized = notes.filter(isRepoNote).map(cloneRepoNote);
      if (sanitized.length > 0) {
        notesByRepoRoot.set(repoRoot, sortNotesDesc(sanitized));
      }
    }
  };

  return {
    list,
    create,
    update,
    remove,
    serialize,
    restore,
  };
};
