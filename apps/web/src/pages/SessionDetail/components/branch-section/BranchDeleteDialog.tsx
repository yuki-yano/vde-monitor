import type { BranchListEntry } from "@vde-monitor/shared";
import { useState } from "react";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

type BranchDeleteDialogProps = {
  entry: BranchListEntry | null;
  deleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (name: string, options: { force: boolean }) => void;
};

export const BranchDeleteDialog = ({
  entry,
  deleting,
  error,
  onOpenChange,
  onDelete,
}: BranchDeleteDialogProps) => {
  return (
    <Dialog open={entry != null} onOpenChange={onOpenChange}>
      {entry ? (
        <BranchDeleteDialogContent
          key={entry.name}
          entry={entry}
          deleting={deleting}
          error={error}
          onOpenChange={onOpenChange}
          onDelete={onDelete}
        />
      ) : null}
    </Dialog>
  );
};

type BranchDeleteDialogContentProps = Omit<BranchDeleteDialogProps, "entry"> & {
  entry: BranchListEntry;
};

const BranchDeleteDialogContent = ({
  entry,
  deleting,
  error,
  onOpenChange,
  onDelete,
}: BranchDeleteDialogContentProps) => {
  const [force, setForce] = useState(false);

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Delete branch</DialogTitle>
        <DialogDescription>
          Delete local branch <span className="font-mono">{entry.name}</span>?
        </DialogDescription>
      </DialogHeader>
      <label htmlFor="branch-delete-force" className="mt-3 flex items-center gap-2 text-xs">
        <Checkbox
          id="branch-delete-force"
          checked={force}
          onChange={(event) => setForce(event.target.checked)}
        />
        <span>Force delete even if unmerged (-D)</span>
      </label>
      {error ? <p className="text-latte-red mt-2 whitespace-pre-wrap text-xs">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={deleting}
          onClick={() => onDelete(entry.name, { force })}
        >
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </DialogContent>
  );
};
