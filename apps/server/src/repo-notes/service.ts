import type { RepoNote } from "@vde-monitor/shared";

import type { createSessionRegistry } from "../session-registry";
import type { createRepoNotesStore } from "./store";

type SessionRegistry = Pick<ReturnType<typeof createSessionRegistry>, "getDetail">;
type RepoNotesStore = Pick<
  ReturnType<typeof createRepoNotesStore>,
  "list" | "create" | "update" | "remove"
>;

type CreateRepoNotesServiceParams = {
  registry: SessionRegistry;
  repoNotes: RepoNotesStore;
  savePersistedState: () => void;
};

const resolveRepoRootFromPane = (registry: SessionRegistry, paneId: string): string | null => {
  const detail = registry.getDetail(paneId);
  return detail?.repoRoot ?? null;
};

export const createRepoNotesService = ({
  registry,
  repoNotes,
  savePersistedState,
}: CreateRepoNotesServiceParams) => {
  const listByPane = (paneId: string): RepoNote[] | null => {
    const repoRoot = resolveRepoRootFromPane(registry, paneId);
    if (!repoRoot) {
      return null;
    }
    return repoNotes.list(repoRoot);
  };

  const createByPane = (
    paneId: string,
    input: { title?: string | null; body: string },
  ): RepoNote | null => {
    const repoRoot = resolveRepoRootFromPane(registry, paneId);
    if (!repoRoot) {
      return null;
    }
    const note = repoNotes.create(repoRoot, input);
    savePersistedState();
    return note;
  };

  const updateByPane = (
    paneId: string,
    noteId: string,
    input: { title?: string | null; body: string },
  ): RepoNote | null => {
    const repoRoot = resolveRepoRootFromPane(registry, paneId);
    if (!repoRoot) {
      return null;
    }
    const note = repoNotes.update(repoRoot, noteId, input);
    if (!note) {
      return null;
    }
    savePersistedState();
    return note;
  };

  const deleteByPane = (paneId: string, noteId: string): boolean | null => {
    const repoRoot = resolveRepoRootFromPane(registry, paneId);
    if (!repoRoot) {
      return null;
    }
    const removed = repoNotes.remove(repoRoot, noteId);
    if (removed) {
      savePersistedState();
    }
    return removed;
  };

  return {
    listByPane,
    createByPane,
    updateByPane,
    deleteByPane,
  };
};
