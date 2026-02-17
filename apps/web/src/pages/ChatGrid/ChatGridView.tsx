import type {
  AllowedKey,
  CommandResponse,
  HighlightCorrectionConfig,
  ImageAttachment,
  LaunchConfig,
  RawItem,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  SessionSummary,
  WorktreeList,
} from "@vde-monitor/shared";
import { ArrowLeft } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Callout } from "@/components/ui";
import { SessionSidebar } from "@/features/shared-session-ui/components/SessionSidebar";
import type { SessionGroup } from "@/lib/session-group";
import type { Theme } from "@/lib/theme";
import type { ChatGridLayout } from "@/pages/ChatGrid/model/chat-grid-layout";
import { backLinkClass } from "@/pages/SessionDetail/sessionDetailUtils";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import { ChatGridBoard } from "./components/ChatGridBoard";
import { ChatGridCandidateModal } from "./components/ChatGridCandidateModal";
import { ChatGridToolbar } from "./components/ChatGridToolbar";

export type ChatGridViewProps = {
  nowMs: number;
  connected: boolean;
  connectionStatus: "healthy" | "degraded" | "disconnected";
  connectionIssue: string | null;
  launchConfig: LaunchConfig;
  requestStateTimeline: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  highlightCorrections: HighlightCorrectionConfig;
  resolvedTheme: Theme;
  sidebarSessionGroups: SessionGroup[];
  sidebarWidth: number;
  selectedCount: number;
  candidateModalOpen: boolean;
  candidateItems: SessionSummary[];
  selectedCandidatePaneIds: string[];
  selectedSessions: SessionSummary[];
  isRestoringSelection: boolean;
  boardLayout: ChatGridLayout;
  screenByPane: Record<string, string[]>;
  screenLoadingByPane: Record<string, boolean>;
  screenErrorByPane: Record<string, string | null>;
  onOpenCandidateModal: () => void;
  onCloseCandidateModal: () => void;
  onToggleCandidatePane: (paneId: string) => void;
  onApplyCandidates: () => void;
  onRefreshAllTiles: () => void;
  onBackToSessionList: () => void;
  onOpenPaneHere: (paneId: string) => void;
  onLaunchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void> | void;
  onTouchRepoPin: (repoRoot: string | null) => void;
  onTouchPanePin: (paneId: string) => void;
  onSidebarResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  uploadImageAttachment?: (paneId: string, file: File) => Promise<ImageAttachment>;
};

export const ChatGridView = ({
  nowMs,
  connected,
  connectionStatus,
  connectionIssue,
  launchConfig,
  requestStateTimeline,
  requestScreen,
  requestWorktrees,
  highlightCorrections,
  resolvedTheme,
  sidebarSessionGroups,
  sidebarWidth,
  selectedCount,
  candidateModalOpen,
  candidateItems,
  selectedCandidatePaneIds,
  selectedSessions,
  isRestoringSelection,
  boardLayout,
  screenByPane,
  screenLoadingByPane,
  screenErrorByPane,
  onOpenCandidateModal,
  onCloseCandidateModal,
  onToggleCandidatePane,
  onApplyCandidates,
  onRefreshAllTiles,
  onBackToSessionList,
  onOpenPaneHere,
  onLaunchAgentInSession,
  onTouchRepoPin,
  onTouchPanePin,
  onSidebarResizeStart,
  sendText,
  sendKeys,
  sendRaw,
  uploadImageAttachment,
}: ChatGridViewProps) => {
  return (
    <>
      <div
        className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        <SessionSidebar
          state={{
            sessionGroups: sidebarSessionGroups,
            nowMs,
            connected,
            connectionIssue,
            launchConfig,
            requestWorktrees,
            requestStateTimeline,
            requestScreen,
            highlightCorrections,
            resolvedTheme,
            currentPaneId: null,
            className: "border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r",
          }}
          actions={{
            onSelectSession: onOpenPaneHere,
            onFocusPane: onOpenPaneHere,
            onLaunchAgentInSession,
            onTouchSession: onTouchPanePin,
            onTouchRepoPin,
          }}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
          onPointerDown={onSidebarResizeStart}
        />
      </div>

      <div
        className="animate-fade-in-up w-full px-2.5 pb-7 pt-3.5 sm:px-4 sm:pb-10 sm:pt-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex items-center justify-between gap-2.5 sm:gap-3">
            <button type="button" className={backLinkClass} onClick={onBackToSessionList}>
              <ArrowLeft className="h-4 w-4" />
              Back to list
            </button>
            <ThemeToggle />
          </div>
          <ChatGridToolbar
            selectedCount={selectedCount}
            connectionStatus={connectionStatus}
            onOpenCandidateModal={onOpenCandidateModal}
            onRefreshAllTiles={onRefreshAllTiles}
          />
          {connectionIssue ? (
            <Callout tone="warning" size="sm">
              {connectionIssue}
            </Callout>
          ) : null}
          <ChatGridBoard
            sessions={selectedSessions}
            isRestoringSelection={isRestoringSelection}
            layout={boardLayout}
            nowMs={nowMs}
            connected={connected}
            screenByPane={screenByPane}
            screenLoadingByPane={screenLoadingByPane}
            screenErrorByPane={screenErrorByPane}
            onTouchSession={onTouchPanePin}
            sendText={sendText}
            sendKeys={sendKeys}
            sendRaw={sendRaw}
            uploadImageAttachment={uploadImageAttachment}
          />
        </div>
      </div>
      <ChatGridCandidateModal
        open={candidateModalOpen}
        candidateItems={candidateItems}
        selectedPaneIds={selectedCandidatePaneIds}
        nowMs={nowMs}
        onOpenChange={(open) => {
          if (!open) {
            onCloseCandidateModal();
          }
        }}
        onTogglePane={onToggleCandidatePane}
        onApply={onApplyCandidates}
      />
    </>
  );
};
