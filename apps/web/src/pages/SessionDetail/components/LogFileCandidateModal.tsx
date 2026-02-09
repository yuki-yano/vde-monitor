import { X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
} from "@/components/ui";

type LogFileCandidateItem = {
  path: string;
  name: string;
  isIgnored?: boolean;
};

type LogFileCandidateModalState = {
  open: boolean;
  reference: string | null;
  items: LogFileCandidateItem[];
};

type LogFileCandidateModalActions = {
  onClose: () => void;
  onSelect: (path: string) => void;
};

type LogFileCandidateModalProps = {
  state: LogFileCandidateModalState;
  actions: LogFileCandidateModalActions;
};

export const LogFileCandidateModal = ({ state, actions }: LogFileCandidateModalProps) => {
  const { open, reference, items } = state;
  const { onClose, onSelect } = actions;

  if (!open) {
    return null;
  }

  const displayedReference = reference ?? "";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="p-0">
        <div className="relative p-4 pb-2 md:p-5 md:pb-2">
          <IconButton
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3"
            variant="lavender"
            size="sm"
            aria-label="Close file candidate modal"
          >
            <X className="h-4 w-4" />
          </IconButton>
          <DialogHeader className="pr-10">
            <DialogTitle>{`Multiple files matched "${displayedReference}"`}</DialogTitle>
            <DialogDescription>Select a file to open it in the modal.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-3 pb-3 md:px-4 md:pb-4">
          <Command>
            <CommandInput placeholder="Search files..." autoFocus />
            <CommandList>
              <CommandEmpty>No file candidates found.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.path}
                    value={`${item.name} ${item.path}`}
                    onSelect={() => {
                      onSelect(item.path);
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="min-w-0 truncate font-mono text-xs leading-5">
                        {item.path}
                      </span>
                      {item.isIgnored ? (
                        <span className="border-latte-peach/40 bg-latte-peach/15 text-latte-peach shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase">
                          ignored
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </DialogContent>
    </Dialog>
  );
};
