import { RefreshCw, Sparkles } from "lucide-react";

import { Button, ConnectionStatusPill, TagPill, Toolbar } from "@/components/ui";

import { CHAT_GRID_MAX_PANE_COUNT } from "../model/chat-grid-layout";

type ChatGridToolbarProps = {
  selectedCount: number;
  connectionStatus: "healthy" | "degraded" | "disconnected";
  transport?: "sse" | "polling";
  onOpenCandidateModal: () => void;
  onRefreshAllTiles: () => void;
};

export const ChatGridToolbar = ({
  selectedCount,
  connectionStatus,
  transport,
  onOpenCandidateModal,
  onRefreshAllTiles,
}: ChatGridToolbarProps) => {
  return (
    <header className="flex flex-col gap-3 rounded-3xl border border-[var(--material-stroke)] bg-[var(--material-canvas)] p-3 shadow-[var(--material-shadow)] backdrop-blur-2xl sm:gap-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-latte-subtext0 text-xs font-medium uppercase tracking-[0.16em]">
            VDE Monitor
          </p>
          <h1 className="font-display text-latte-text text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Chat Grid
          </h1>
        </div>
        <div className="pt-0.5">
          <ConnectionStatusPill status={connectionStatus} transport={transport} />
        </div>
      </div>

      <Toolbar className="gap-2.5">
        <Button type="button" size="sm" onClick={onOpenCandidateModal}>
          <Sparkles className="h-4 w-4" />
          Show Candidates
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRefreshAllTiles}>
          <RefreshCw className="h-4 w-4" />
          Refresh Screens
        </Button>
        <TagPill tone="meta" className="ml-auto text-[11px]">
          Selected: {selectedCount} (max {CHAT_GRID_MAX_PANE_COUNT})
        </TagPill>
      </Toolbar>
    </header>
  );
};
