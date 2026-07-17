import type { BranchListEntry } from "@vde-monitor/shared";
import { useState } from "react";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <BranchCreateDialogContent
          branches={branches}
          currentBranch={currentBranch}
          creating={creating}
          error={error}
          onOpenChange={onOpenChange}
          onCreate={onCreate}
        />
      ) : null}
    </Dialog>
  );
};

type BranchCreateDialogContentProps = Omit<BranchCreateDialogProps, "open">;

const BranchCreateDialogContent = ({
  branches,
  currentBranch,
  creating,
  error,
  onOpenChange,
  onCreate,
}: BranchCreateDialogContentProps) => {
  const [name, setName] = useState("");
  const [base, setBase] = useState<string>("");

  return (
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
        <label htmlFor="branch-create-name" className="flex flex-col gap-1 text-xs">
          <span className="text-latte-subtext0">Branch name</span>
          <Input
            id="branch-create-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="feature/awesome"
            autoFocus
          />
        </label>
        <label htmlFor="branch-create-base" className="flex flex-col gap-1 text-xs">
          <span className="text-latte-subtext0">Base branch</span>
          <select
            id="branch-create-base"
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
        {error ? <p className="text-latte-red-text whitespace-pre-wrap text-xs">{error}</p> : null}
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
  );
};
