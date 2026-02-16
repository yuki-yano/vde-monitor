import type { RepoNote } from "@vde-monitor/shared";
import {
  BookText,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Button,
  Callout,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  IconButton,
  LoadingOverlay,
  PanelSection,
  SectionHeader,
  ZoomSafeTextarea,
} from "@/components/ui";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

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

  const deleteTargetNote = deleteDialogNoteId
    ? (notes.find((note) => note.id === deleteDialogNoteId) ?? null)
    : null;
  const isDeleteDialogOpen = deleteDialogNoteId != null;
  const isDeletingDialogTarget =
    deleteDialogNoteId != null && deletingNoteId === deleteDialogNoteId;
  const deleteTargetPreview = deleteTargetNote ? formatPreviewBody(deleteTargetNote.body) : null;

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
            <RefreshCw className={`h-4 w-4 ${notesLoading ? "animate-spin" : ""}`} />
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
            <div className="flex flex-col gap-2">
              {notes.map((note) => {
                const isOpen = openNoteIdSet.has(note.id);
                const isEditing = note.id === editingNoteId;
                const isSaving = savingNoteId === note.id;
                const isDeleting = deletingNoteId === note.id;
                const isCopied = copiedNoteId === note.id;
                return (
                  <PanelSection
                    key={note.id}
                    className="border-latte-surface2/70 bg-latte-base/60 rounded-2xl border"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label={`${isOpen ? "Collapse" : "Expand"} note ${note.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => toggleNoteOpen(note.id)}
                      >
                        {isOpen ? (
                          <ChevronDown className="text-latte-subtext0 h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="text-latte-subtext0 h-4 w-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-latte-subtext0 truncate text-sm font-medium">
                            {formatPreviewBody(note.body)}
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                        <IconButton
                          type="button"
                          size="sm"
                          aria-label={`Copy note ${note.id}`}
                          onClick={() => {
                            handleCopyNote(note);
                          }}
                          disabled={isDeleting}
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </IconButton>
                        {isCopied ? (
                          <span className="text-latte-green text-[10px] font-semibold tracking-[0.12em]">
                            Copied
                          </span>
                        ) : null}
                        <IconButton
                          type="button"
                          variant="base"
                          size="sm"
                          className="border-latte-red/40 bg-latte-red/10 text-latte-red/85 hover:border-latte-red/65 hover:bg-latte-red/20 hover:text-latte-red"
                          aria-label={`Delete note ${note.id}`}
                          onClick={() => {
                            openDeleteDialog(note.id);
                          }}
                          disabled={isDeleting || isSaving}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="mt-2">
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <div className="border-latte-surface2 focus-within:border-latte-lavender focus-within:ring-latte-lavender/30 bg-latte-base/70 overflow-hidden rounded-2xl border transition focus-within:ring-2">
                              <ZoomSafeTextarea
                                ref={editingTextareaRef}
                                aria-label={`Edit note body ${note.id}`}
                                className="text-latte-text min-h-[96px] w-full resize-y bg-transparent px-3 py-2 text-base outline-none"
                                maxLength={10_000}
                                value={editingBody}
                                autoFocus
                                onChange={(event) => setEditingBody(event.target.value)}
                                onBlur={finishEdit}
                              />
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Start editing note ${note.id}`}
                            className="text-latte-subtext0 hover:bg-latte-surface0/60 focus-visible:ring-latte-lavender/30 w-full whitespace-pre-wrap break-words rounded-xl px-2 py-1 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2"
                            onClick={() => beginEdit(note)}
                          >
                            {note.body.length > 0 ? note.body : EMPTY_NOTE_PREVIEW}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </PanelSection>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeDeleteDialog();
          }
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-1rem))] sm:w-[min(420px,calc(100vw-1.5rem))]">
          <DialogHeader>
            <DialogTitle>Delete note?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteTargetPreview ? (
            <div className="border-latte-surface2/70 bg-latte-base/70 rounded-xl border px-2.5 py-2">
              <p className="text-latte-subtext0 truncate text-sm">{deleteTargetPreview}</p>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeDeleteDialog}
              disabled={isDeletingDialogTarget}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                if (deleteDialogNoteId && deleteTargetNote) {
                  handleDeleteNote(deleteDialogNoteId);
                }
              }}
              disabled={
                !deleteDialogNoteId ||
                !deleteTargetNote ||
                isDeletingDialogTarget ||
                savingNoteId === deleteDialogNoteId
              }
            >
              {isDeletingDialogTarget ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
