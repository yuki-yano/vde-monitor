import { RefreshCw, Sparkles } from "lucide-react";

import { Button, ConnectionStatusPill, TagPill, Toolbar } from "@/components/ui";

import { CHAT_GRID_MAX_PANE_COUNT } from "../model/chat-grid-layout";

type ChatGridToolbarProps = {
  selectedCount: number;
  connectionStatus: "healthy" | "degraded" | "disconnected";
  onOpenCandidateModal: () => void;
  onRefreshAllTiles: () => void;
};

export const ChatGridToolbar = ({
  selectedCount,
  connectionStatus,
  onOpenCandidateModal,
  onRefreshAllTiles,
}: ChatGridToolbarProps) => {
  return (
    <header className="shadow-glass border-latte-surface1/60 bg-latte-base/80 flex flex-col gap-3 rounded-3xl border p-3 backdrop-blur sm:gap-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-latte-subtext0 text-xs tracking-[0.24em]">VDE Monitor</p>
          <h1 className="font-display text-latte-text text-3xl font-semibold tracking-tight sm:text-4xl">
            Chat Grid
          </h1>
        </div>
        <div className="pt-0.5">
          <ConnectionStatusPill status={connectionStatus} />
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
