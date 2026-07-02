import type { BranchListEntry } from "@vde-monitor/shared";
import { useEffect, useState } from "react";

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
  const [force, setForce] = useState(false);

  // Reset on close (including programmatic close after a successful delete,
  // which bypasses Dialog's onOpenChange).
  useEffect(() => {
    if (entry == null) {
      setForce(false);
    }
  }, [entry]);

  return (
    <Dialog open={entry != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete branch</DialogTitle>
          <DialogDescription>
            {entry ? (
              <>
                Delete local branch <span className="font-mono">{entry.name}</span>?
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <label className="mt-3 flex items-center gap-2 text-xs">
          <Checkbox checked={force} onChange={(event) => setForce(event.target.checked)} />
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
            disabled={deleting || !entry}
            onClick={() => {
              if (entry) {
                onDelete(entry.name, { force });
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
