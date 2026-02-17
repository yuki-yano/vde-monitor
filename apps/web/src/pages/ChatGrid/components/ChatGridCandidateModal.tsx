import type { SessionSummary } from "@vde-monitor/shared";
import { GitBranch, MousePointerClick, Search } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import {
  resolveSessionDisplayTitle,
  resolveSessionStateLabel,
  resolveSessionStateTone,
} from "@/features/shared-session-ui/model/session-display";
import {
  agentLabelFor,
  agentToneFor,
  formatBranchLabel,
  formatRelativeTime,
  isKnownAgent,
} from "@/lib/session-format";

import { CHAT_GRID_MAX_PANE_COUNT, CHAT_GRID_MIN_PANE_COUNT } from "../model/chat-grid-layout";

type ChatGridCandidateModalProps = {
  open: boolean;
  candidateItems: SessionSummary[];
  selectedPaneIds: string[];
  nowMs: number;
  onOpenChange: (open: boolean) => void;
  onTogglePane: (paneId: string) => void;
  onApply: () => void;
};

const MIN_SELECTION_COUNT = CHAT_GRID_MIN_PANE_COUNT;
const MAX_SELECTION_COUNT = CHAT_GRID_MAX_PANE_COUNT;
const SEARCH_INPUT_DEBOUNCE_MS = 120;

const normalizeSearchText = (value: string) => value.trim().toLowerCase();
const tokenizeSearchTerms = (value: string) =>
  normalizeSearchText(value)
    .split(/[\s\u3000]+/)
    .filter((term) => term.length > 0);

export const ChatGridCandidateModal = ({
  open,
  candidateItems,
  selectedPaneIds,
  nowMs,
  onOpenChange,
  onTogglePane,
  onApply,
}: ChatGridCandidateModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const selectedPaneSet = new Set(selectedPaneIds);
  const selectedCount = selectedPaneIds.length;
  const reachedMaxSelection = selectedCount >= MAX_SELECTION_COUNT;
  const hasSelectionError =
    selectedCount < MIN_SELECTION_COUNT || selectedCount > MAX_SELECTION_COUNT;
  const searchTerms = tokenizeSearchTerms(debouncedSearchQuery);
  const hasCandidates = candidateItems.length > 0;

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (searchQuery === debouncedSearchQuery) {
      return;
    }
    const debounceMs = searchQuery.length === 0 ? 0 : SEARCH_INPUT_DEBOUNCE_MS;
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [debouncedSearchQuery, searchQuery]);

  const filteredCandidateItems = useMemo(() => {
    if (searchTerms.length === 0) {
      return candidateItems;
    }
    return candidateItems.filter((session) => {
      const searchableValues = [
        resolveSessionDisplayTitle(session),
        session.sessionName,
        `${session.windowIndex}`,
        `window ${session.windowIndex}`,
        `pane ${session.paneId}`,
        formatBranchLabel(session.branch),
      ];
      const searchableText = normalizeSearchText(searchableValues.join(" "));
      return searchTerms.every((term) => searchableText.includes(term));
    });
  }, [candidateItems, searchTerms]);
  const hasFilteredCandidates = filteredCandidateItems.length > 0;

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,calc(100vw-1rem))] sm:w-[min(760px,calc(100vw-1.5rem))]">
        <DialogHeader className="space-y-2">
          <DialogTitle>Candidate Panes</DialogTitle>
          <DialogDescription>
            Choose {MIN_SELECTION_COUNT}-{MAX_SELECTION_COUNT} panes and click Apply.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-latte-subtext0 text-xs uppercase tracking-[0.08em]">
              Search Candidates
            </p>
            <div className="border-latte-surface2 text-latte-text focus-within:border-latte-lavender focus-within:ring-latte-lavender/30 bg-latte-base/70 shadow-elev-1 relative overflow-hidden rounded-2xl border transition focus-within:ring-2">
              <Search className="text-latte-subtext0 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Filter by session or window"
                aria-label="Filter candidate panes"
                className="h-9 border-none bg-transparent py-0 pl-10 pr-3 text-sm shadow-none focus:ring-0 sm:pl-10 sm:pr-3"
              />
            </div>
          </div>

          <div
            data-testid="candidate-pane-list"
            className="border-latte-surface1/70 bg-latte-base/50 h-[64vh] min-h-[360px] overflow-y-auto rounded-2xl border p-2"
          >
            {!hasCandidates ? (
              <div className="flex h-full items-center justify-center p-1">
                <Callout tone="warning" size="sm" className="w-full">
                  No candidate panes are available.
                </Callout>
              </div>
            ) : !hasFilteredCandidates ? (
              <div className="flex h-full items-center justify-center p-1">
                <Callout tone="warning" size="sm" className="w-full">
                  No candidate panes match "{searchQuery}".
                </Callout>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCandidateItems.map((session) => {
                  const checked = selectedPaneSet.has(session.paneId);
                  const disabled = !checked && reachedMaxSelection;
                  return (
                    <label
                      key={session.paneId}
                      className="border-latte-surface1/65 hover:border-latte-lavender/45 hover:bg-latte-surface0/60 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition"
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => onTogglePane(session.paneId)}
                        disabled={disabled}
                        aria-label={`Select ${resolveSessionDisplayTitle(session)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <Badge tone={resolveSessionStateTone(session)} size="sm">
                            {resolveSessionStateLabel(session)}
                          </Badge>
                          {isKnownAgent(session.agent) ? (
                            <Badge tone={agentToneFor(session.agent)} size="sm">
                              {agentLabelFor(session.agent)}
                            </Badge>
                          ) : null}
                          <span className="text-latte-subtext0 ml-auto text-[11px]">
                            {formatRelativeTime(session.lastInputAt, nowMs)}
                          </span>
                        </div>
                        <p className="text-latte-text mt-1 truncate text-sm font-medium">
                          {resolveSessionDisplayTitle(session)}
                        </p>
                        <div className="text-latte-subtext0 mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                          <span>Session {session.sessionName}</span>
                          <span>Window {session.windowIndex}</span>
                          <span className="inline-flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {formatBranchLabel(session.branch)}
                          </span>
                          <span>Pane {session.paneId}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {hasSelectionError ? (
            <Callout tone="warning" size="sm">
              Select between {MIN_SELECTION_COUNT} and {MAX_SELECTION_COUNT} panes.
            </Callout>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={onApply} disabled={hasSelectionError}>
              <MousePointerClick className="h-4 w-4" />
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
