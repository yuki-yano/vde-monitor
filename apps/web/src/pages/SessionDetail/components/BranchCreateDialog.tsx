import type { BranchListEntry } from "@vde-monitor/shared";
import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";

type BranchCreateDialogProps = {
  open: boolean;
  branches: BranchListEntry[];
  currentBranch: string | null;
  creating: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, base?: string) => void;
};

export const BranchCreateDialog = ({
  open,
  branches,
  currentBranch,
  creating,
  error,
  onOpenChange,
  onCreate,
}: BranchCreateDialogProps) => {
  const [name, setName] = useState("");
  const [base, setBase] = useState<string>("");

  // Reset inputs on close (including programmatic close after a successful
  // create, which bypasses Dialog's onOpenChange).
  useEffect(() => {
    if (!open) {
      setName("");
      setBase("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create branch</DialogTitle>
          <DialogDescription>
            Create a new branch and check it out in the session worktree.
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length === 0) {
              return;
            }
            onCreate(name.trim(), base.length > 0 ? base : undefined);
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-latte-subtext0">Branch name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="feature/awesome"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-latte-subtext0">Base branch</span>
            <select
              className="border-latte-surface2/70 bg-latte-base text-latte-text rounded-lg border px-2 py-1.5 text-sm"
              value={base}
              onChange={(event) => setBase(event.target.value)}
            >
              <option value="">{`Current HEAD${currentBranch ? ` (${currentBranch})` : ""}`}</option>
              {branches.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-latte-red whitespace-pre-wrap text-xs">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating || name.trim().length === 0}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
