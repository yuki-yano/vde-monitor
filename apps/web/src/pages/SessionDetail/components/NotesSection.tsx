import type { RepoNote } from "@vde-monitor/shared";
import { BookText, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Callout,
  Card,
  EmptyState,
  IconButton,
  LoadingOverlay,
  SectionHeader,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

import { NotesDeleteDialog, NotesSectionList } from "./notes-section-list";

type NotesSectionState = {
  repoRoot: string | null;
  notes: RepoNote[];
  notesLoading: boolean;
  notesError: string | null;
  creatingNote: boolean;
  savingNoteId: string | null;
  deletingNoteId: string | null;
};

type NotesSectionActions = {
  onRefresh: (options?: { silent?: boolean }) => void;
  onCreate: (input: { title?: string | null; body: string }) => Promise<boolean>;
  onSave: (noteId: string, input: { title?: string | null; body: string }) => Promise<boolean>;
  onDelete: (noteId: string) => Promise<boolean>;
};

type NotesSectionProps = {
  state: NotesSectionState;
  actions: NotesSectionActions;
};

const AUTO_SAVE_DEBOUNCE_MS = 700;
const COPY_FEEDBACK_MS = 1200;
const AUTO_SYNC_INTERVAL_MS = 10_000;
const EMPTY_NOTE_PREVIEW = "(empty note)";

const formatPreviewBody = (body: string) => {
  const firstLine = body.split(/\r?\n/u, 1)[0] ?? "";
  const normalized = firstLine.replace(/\s+/gu, " ").trim();
  return normalized.length > 0 ? normalized : EMPTY_NOTE_PREVIEW;
};

export const NotesSection = ({ state, actions }: NotesSectionProps) => {
  const { repoRoot, notes, notesLoading, notesError, creatingNote, savingNoteId, deletingNoteId } =
    state;
  const { onRefresh, onCreate, onSave, onDelete } = actions;

  const [openNoteIdSet, setOpenNoteIdSet] = useState<Set<string>>(() => new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [deleteDialogNoteId, setDeleteDialogNoteId] = useState<string | null>(null);

  const editingNoteIdRef = useRef<string | null>(null);
  const editingBodyRef = useRef("");
  const lastSavedBodyRef = useRef("");
  const autoSaveTimerRef = useRef<number | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingNewNoteAutoEditRef = useRef(false);
  const previousNoteIdSetRef = useRef<Set<string>>(new Set(notes.map((note) => note.id)));

  useEffect(() => {
    editingNoteIdRef.current = editingNoteId;
  }, [editingNoteId]);

  useEffect(() => {
    editingBodyRef.current = editingBody;
  }, [editingBody]);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const clearCopyResetTimer = useCallback(() => {
    if (copyResetTimerRef.current != null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, []);

  const runAutoSave = useCallback(
    (noteId: string, body: string) => {
      const queuedSave = saveQueueRef.current.then(async () => {
        try {
          const ok = await onSave(noteId, { title: null, body });
          if (ok && editingNoteIdRef.current === noteId) {
            lastSavedBodyRef.current = body;
          }
          return ok;
        } catch {
          return false;
        }
      });
      saveQueueRef.current = queuedSave;
      return queuedSave;
    },
    [onSave],
  );

  const flushPendingAutoSave = useCallback(async () => {
    const noteId = editingNoteIdRef.current;
    if (!noteId) {
      return true;
    }
    clearAutoSaveTimer();
    const currentBody = editingBodyRef.current;
    if (currentBody === lastSavedBodyRef.current) {
      return true;
    }
    return runAutoSave(noteId, currentBody);
  }, [clearAutoSaveTimer, runAutoSave]);

  const applyToggleNoteOpen = useCallback((noteId: string) => {
    setOpenNoteIdSet((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  const toggleNoteOpen = useCallback(
    (noteId: string) => {
      void (async () => {
        if (editingNoteIdRef.current === noteId) {
          const ok = await flushPendingAutoSave();
          if (!ok) {
            return;
          }
          setEditingNoteId(null);
          setEditingBody("");
          lastSavedBodyRef.current = "";
        }
        applyToggleNoteOpen(noteId);
      })();
    },
    [applyToggleNoteOpen, flushPendingAutoSave],
  );

  const beginEdit = useCallback(
    (note: RepoNote) => {
      void (async () => {
        if (editingNoteIdRef.current && editingNoteIdRef.current !== note.id) {
          const ok = await flushPendingAutoSave();
          if (!ok) {
            return;
          }
        }
        setEditingNoteId(note.id);
        setEditingBody(note.body);
        lastSavedBodyRef.current = note.body;
        setOpenNoteIdSet((prev) => new Set(prev).add(note.id));
      })();
    },
    [flushPendingAutoSave],
  );

  const finishEdit = useCallback(() => {
    void (async () => {
      const ok = await flushPendingAutoSave();
      if (!ok) {
        return;
      }
      setEditingNoteId(null);
      setEditingBody("");
      lastSavedBodyRef.current = "";
    })();
  }, [flushPendingAutoSave]);

  const handleAddNote = useCallback(() => {
    void (async () => {
      pendingNewNoteAutoEditRef.current = true;
      const ok = await onCreate({ title: null, body: "" });
      if (!ok) {
        pendingNewNoteAutoEditRef.current = false;
      }
    })();
  }, [onCreate]);

  const handleCopyNote = useCallback(
    (note: RepoNote) => {
      void (async () => {
        const copied = await copyToClipboard(note.body);
        if (!copied) {
          return;
        }
        setCopiedNoteId(note.id);
        clearCopyResetTimer();
        copyResetTimerRef.current = window.setTimeout(() => {
          setCopiedNoteId((prev) => (prev === note.id ? null : prev));
        }, COPY_FEEDBACK_MS);
      })();
    },
    [clearCopyResetTimer],
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      void (async () => {
        const ok = await onDelete(noteId);
        if (!ok) {
          return;
        }
        setDeleteDialogNoteId((prev) => (prev === noteId ? null : prev));
        setOpenNoteIdSet((prev) => {
          if (!prev.has(noteId)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
        if (editingNoteIdRef.current === noteId) {
          clearAutoSaveTimer();
          setEditingNoteId(null);
          setEditingBody("");
          lastSavedBodyRef.current = "";
        }
      })();
    },
    [clearAutoSaveTimer, onDelete],
  );

  const openDeleteDialog = useCallback((noteId: string) => {
    setDeleteDialogNoteId(noteId);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogNoteId(null);
  }, []);

  useEffect(() => {
    if (!editingNoteId) {
      clearAutoSaveTimer();
      return;
    }
    if (editingBody === lastSavedBodyRef.current) {
      clearAutoSaveTimer();
      return;
    }
    clearAutoSaveTimer();
    const targetNoteId = editingNoteId;
    const targetBody = editingBody;
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void runAutoSave(targetNoteId, targetBody);
    }, AUTO_SAVE_DEBOUNCE_MS);
    return clearAutoSaveTimer;
  }, [clearAutoSaveTimer, editingBody, editingNoteId, runAutoSave]);

  useEffect(() => {
    if (!editingNoteId) {
      return;
    }
    const exists = notes.some((note) => note.id === editingNoteId);
    if (exists) {
      return;
    }
    clearAutoSaveTimer();
    setEditingNoteId(null);
    setEditingBody("");
    lastSavedBodyRef.current = "";
  }, [clearAutoSaveTimer, editingNoteId, notes]);

  useEffect(() => {
    const previousIds = previousNoteIdSetRef.current;
    if (pendingNewNoteAutoEditRef.current && notes.length > 0) {
      const createdNote = notes.find((note) => !previousIds.has(note.id));
      if (createdNote) {
        setOpenNoteIdSet((prev) => new Set(prev).add(createdNote.id));
        setEditingNoteId(createdNote.id);
        setEditingBody(createdNote.body);
        lastSavedBodyRef.current = createdNote.body;
        pendingNewNoteAutoEditRef.current = false;
      }
    }
    previousNoteIdSetRef.current = new Set(notes.map((note) => note.id));
  }, [notes]);

  useEffect(() => {
    if (!editingNoteId) {
      return;
    }
    const textarea = editingTextareaRef.current;
    if (!textarea) {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      const end = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(end, end);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [editingNoteId]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      clearCopyResetTimer();
    };
  }, [clearAutoSaveTimer, clearCopyResetTimer]);

  useEffect(() => {
    if (!repoRoot) {
      return;
    }
    onRefresh({ silent: true });
    const intervalId = window.setInterval(() => {
      onRefresh({ silent: true });
    }, AUTO_SYNC_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [onRefresh, repoRoot]);

  return (
    <Card className="relative flex min-w-0 flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
      <div className="relative pb-1.5 sm:pb-2">
        <SectionHeader title="Notes" />
        <div className="absolute right-0 top-0 z-10 flex items-center gap-1.5">
          <IconButton
            type="button"
            size="sm"
            aria-label="Refresh notes"
            onClick={() => onRefresh()}
            disabled={!repoRoot}
          >
            <RefreshCw className={cn("h-4 w-4", notesLoading && "animate-spin")} />
          </IconButton>
          <IconButton
            type="button"
            size="sm"
            variant="base"
            className="border-latte-lavender/70 bg-latte-lavender text-latte-base shadow-glow hover:border-latte-lavender/80 hover:bg-latte-lavender hover:translate-y-[-1px]"
            aria-label="Add note"
            onClick={handleAddNote}
            disabled={!repoRoot || creatingNote}
          >
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {notesLoading ? <LoadingOverlay label="Loading notes..." blocking={false} /> : null}

      {notesError ? (
        <Callout tone="error" size="xs">
          {notesError}
        </Callout>
      ) : null}

      {!repoRoot ? (
        <Callout tone="warning" size="xs">
          {`Repository root is unavailable for this session.`}
        </Callout>
      ) : (
        <>
          {notes.length === 0 ? (
            <EmptyState
              icon={<BookText className="text-latte-overlay1 h-6 w-6" />}
              message="No notes yet"
              iconWrapperClassName="bg-latte-surface1/50"
            />
          ) : (
            <NotesSectionList
              notes={notes}
              openNoteIdSet={openNoteIdSet}
              editingNoteId={editingNoteId}
              editingBody={editingBody}
              copiedNoteId={copiedNoteId}
              savingNoteId={savingNoteId}
              deletingNoteId={deletingNoteId}
              editingTextareaRef={editingTextareaRef}
              onToggleNoteOpen={toggleNoteOpen}
              onCopyNote={handleCopyNote}
              onOpenDeleteDialog={openDeleteDialog}
              onBeginEdit={beginEdit}
              onSetEditingBody={setEditingBody}
              onFinishEdit={finishEdit}
              formatPreviewBody={formatPreviewBody}
              emptyNotePreview={EMPTY_NOTE_PREVIEW}
            />
          )}
        </>
      )}

      <NotesDeleteDialog
        notes={notes}
        deleteDialogNoteId={deleteDialogNoteId}
        deletingNoteId={deletingNoteId}
        savingNoteId={savingNoteId}
        onCloseDeleteDialog={closeDeleteDialog}
        onDeleteNote={handleDeleteNote}
        formatPreviewBody={formatPreviewBody}
      />
    </Card>
  );
};
