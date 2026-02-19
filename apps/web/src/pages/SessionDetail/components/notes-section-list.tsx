import type { RepoNote } from "@vde-monitor/shared";
import { Check, ChevronDown, ChevronRight, Copy, Trash2 } from "lucide-react";
import { type RefObject, useMemo } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  PanelSection,
  ZoomSafeTextarea,
} from "@/components/ui";

type NotesSectionListProps = {
  notes: RepoNote[];
  openNoteIdSet: Set<string>;
  editingNoteId: string | null;
  editingBody: string;
  copiedNoteId: string | null;
  savingNoteId: string | null;
  deletingNoteId: string | null;
  editingTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onToggleNoteOpen: (noteId: string) => void;
  onCopyNote: (note: RepoNote) => void;
  onOpenDeleteDialog: (noteId: string) => void;
  onBeginEdit: (note: RepoNote) => void;
  onSetEditingBody: (value: string) => void;
  onFinishEdit: () => void;
  formatPreviewBody: (body: string) => string;
  emptyNotePreview: string;
};

export const NotesSectionList = ({
  notes,
  openNoteIdSet,
  editingNoteId,
  editingBody,
  copiedNoteId,
  savingNoteId,
  deletingNoteId,
  editingTextareaRef,
  onToggleNoteOpen,
  onCopyNote,
  onOpenDeleteDialog,
  onBeginEdit,
  onSetEditingBody,
  onFinishEdit,
  formatPreviewBody,
  emptyNotePreview,
}: NotesSectionListProps) => (
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
              onClick={() => onToggleNoteOpen(note.id)}
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
                  onCopyNote(note);
                }}
                disabled={isDeleting}
              >
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
                  onOpenDeleteDialog(note.id);
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
                      onChange={(event) => onSetEditingBody(event.target.value)}
                      onBlur={onFinishEdit}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Start editing note ${note.id}`}
                  className="text-latte-subtext0 hover:bg-latte-surface0/60 focus-visible:ring-latte-lavender/30 w-full whitespace-pre-wrap break-words rounded-xl px-2 py-1 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2"
                  onClick={() => onBeginEdit(note)}
                >
                  {note.body.length > 0 ? note.body : emptyNotePreview}
                </button>
              )}
            </div>
          ) : null}
        </PanelSection>
      );
    })}
  </div>
);

type NotesDeleteDialogProps = {
  notes: RepoNote[];
  deleteDialogNoteId: string | null;
  deletingNoteId: string | null;
  savingNoteId: string | null;
  onCloseDeleteDialog: () => void;
  onDeleteNote: (noteId: string) => void;
  emptyNotePreview: string;
};

const DELETE_PREVIEW_MAX_LINES = 3;

const buildDeleteTargetPreview = (body: string, emptyNotePreview: string) => {
  if (body.length === 0) {
    return { lines: [emptyNotePreview], isTruncated: false };
  }
  const allLines = body.split(/\r?\n/u);
  return {
    lines: allLines.slice(0, DELETE_PREVIEW_MAX_LINES),
    isTruncated: allLines.length > DELETE_PREVIEW_MAX_LINES,
  };
};

export const NotesDeleteDialog = ({
  notes,
  deleteDialogNoteId,
  deletingNoteId,
  savingNoteId,
  onCloseDeleteDialog,
  onDeleteNote,
  emptyNotePreview,
}: NotesDeleteDialogProps) => {
  const deleteTargetNote = deleteDialogNoteId
    ? (notes.find((note) => note.id === deleteDialogNoteId) ?? null)
    : null;
  const isDeleteDialogOpen = deleteDialogNoteId != null;
  const isDeletingDialogTarget =
    deleteDialogNoteId != null && deletingNoteId === deleteDialogNoteId;
  const deleteTargetPreview = deleteTargetNote
    ? buildDeleteTargetPreview(deleteTargetNote.body, emptyNotePreview)
    : null;
  const deleteTargetPreviewRows = useMemo(() => {
    if (!deleteTargetPreview) {
      return [];
    }
    const lineCounts = new Map<string, number>();
    return deleteTargetPreview.lines.map((line) => {
      const count = lineCounts.get(line) ?? 0;
      lineCounts.set(line, count + 1);
      return {
        key: `delete-preview-${line}-${count}`,
        line,
      };
    });
  }, [deleteTargetPreview]);

  return (
    <Dialog
      open={isDeleteDialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCloseDeleteDialog();
        }
      }}
    >
      <DialogContent className="w-[min(420px,calc(100vw-1rem))] sm:w-[min(420px,calc(100vw-1.5rem))]">
        <DialogHeader>
          <DialogTitle>Delete note?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        {deleteTargetPreview ? (
          <div className="border-latte-surface2/70 bg-latte-base/70 mt-1.5 rounded-xl border px-2.5 py-2">
            <div className="text-latte-subtext0 flex flex-col gap-0.5 text-[13px] leading-5">
              {deleteTargetPreviewRows.map((item) => (
                <p key={item.key} className="whitespace-pre-wrap break-words">
                  {item.line}
                </p>
              ))}
              {deleteTargetPreview.isTruncated ? (
                <p className="text-latte-overlay1 leading-4">...</p>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCloseDeleteDialog}
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
                onDeleteNote(deleteDialogNoteId);
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
  );
};
