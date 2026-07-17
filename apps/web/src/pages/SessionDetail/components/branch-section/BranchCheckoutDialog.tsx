import type { BranchListEntry } from "@vde-monitor/shared";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

type BranchCheckoutDialogProps = {
  entry: BranchListEntry | null;
  checkingOut: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onCheckout: (name: string) => void;
};

export const BranchCheckoutDialog = ({
  entry,
  checkingOut,
  error,
  onOpenChange,
  onCheckout,
}: BranchCheckoutDialogProps) => {
  return (
    <Dialog open={entry != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Checkout branch</DialogTitle>
          <DialogDescription>
            {entry ? (
              <>
                Switch the session working directory to{" "}
                <span className="font-mono">{entry.name}</span>?
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-latte-red-text mt-2 whitespace-pre-wrap text-xs">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={checkingOut || !entry}
            onClick={() => {
              if (entry) {
                onCheckout(entry.name);
              }
            }}
          >
            {checkingOut ? "Checking out..." : "Checkout"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
