import type { LaunchConfig, WorktreeList } from "@vde-monitor/shared";
import { Pin } from "lucide-react";

import { LaunchAgentButton } from "@/components/launch-agent-button";
import { IconButton, TagPill } from "@/components/ui";
import { formatRepoDirLabel } from "@/lib/quick-panel-utils";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import type { SidebarRepoGroup } from "../hooks/useSessionSidebarGroups";
import { isVwManagedWorktreePath } from "../sessionDetailUtils";
import { SessionSidebarItem } from "./SessionSidebarItem";

type SessionSidebarGroupListProps = {
  sidebarGroups: SidebarRepoGroup[];
  nowMs: number;
  currentPaneId?: string | null;
  focusPendingPaneIds: Set<string>;
  launchPendingSessions: Set<string>;
  launchConfig: LaunchConfig;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  onHoverStart: (paneId: string) => void;
  onHoverEnd: (paneId: string) => void;
  onFocus: (paneId: string) => void;
  onBlur: (paneId: string) => void;
  onSelect: (paneId: string) => void;
  onFocusPane: (paneId: string) => Promise<void> | void;
  onLaunchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void> | void;
  onTouchSession: (paneId: string) => void;
  onTouchRepoPin: (repoRoot: string | null) => void;
  registerItemRef: (paneId: string, node: HTMLDivElement | null) => void;
};

export const SessionSidebarGroupList = ({
  sidebarGroups,
  nowMs,
  currentPaneId,
  focusPendingPaneIds,
  launchPendingSessions,
  launchConfig,
  requestWorktrees,
  onHoverStart,
  onHoverEnd,
  onFocus,
  onBlur,
  onSelect,
  onFocusPane,
  onLaunchAgentInSession,
  onTouchSession,
  onTouchRepoPin,
  registerItemRef,
}: SessionSidebarGroupListProps) => {
  const launchedSessions = new Set<string>();

  return (
    <div className="space-y-5">
      {sidebarGroups.length === 0 && (
        <div className="border-latte-surface2/60 bg-latte-crust/50 text-latte-subtext0 rounded-2xl border px-3 py-4 text-center text-xs">
          No sessions available for this filter.
        </div>
      )}
      {sidebarGroups.map((group) => {
        const groupTotalPanes = group.windowGroups.reduce(
          (total, windowGroup) => total + windowGroup.sessions.length,
          0,
        );
        return (
          <div key={group.repoRoot ?? "no-repo"} className="space-y-3">
            <div className="border-latte-surface2/70 bg-latte-base/80 flex items-center justify-between gap-2 rounded-2xl border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="bg-latte-lavender/70 h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_rgb(var(--ctp-lavender)/0.5)]" />
                <span className="text-latte-lavender/80 truncate text-[11px] font-semibold uppercase tracking-wider">
                  {formatRepoDirLabel(group.repoRoot)}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <IconButton
                  type="button"
                  size="xs"
                  variant="base"
                  aria-label="Pin repo to top"
                  title="Pin repo to top"
                  className="border-latte-lavender/35 bg-latte-base/85 text-latte-lavender hover:bg-latte-lavender/12"
                  onClick={() => onTouchRepoPin(group.repoRoot)}
                >
                  <Pin className="h-3.5 w-3.5" />
                </IconButton>
                <TagPill tone="neutral" className="text-[9px]">
                  {group.windowGroups.length} windows
                </TagPill>
              </div>
            </div>
            <div className="space-y-4 pl-2.5">
              {group.windowGroups.map((windowGroup) => {
                const shouldRenderLaunchButtons = !launchedSessions.has(windowGroup.sessionName);
                if (shouldRenderLaunchButtons) {
                  launchedSessions.add(windowGroup.sessionName);
                }
                const sessionPaneCandidates = group.windowGroups
                  .filter((candidate) => candidate.sessionName === windowGroup.sessionName)
                  .flatMap((candidate) => candidate.sessions);
                const repoRootPane = sessionPaneCandidates.find((session) => {
                  const repoRoot = session.repoRoot?.trim();
                  const worktreePath = session.worktreePath?.trim();
                  return Boolean(repoRoot && worktreePath && repoRoot === worktreePath);
                });
                const nonWorktreePane = sessionPaneCandidates.find(
                  (session) => !isVwManagedWorktreePath(session.worktreePath),
                );
                const launchSourceSession =
                  repoRootPane ??
                  nonWorktreePane ??
                  sessionPaneCandidates.find((session) => session.paneActive) ??
                  sessionPaneCandidates[0];

                return (
                  <div
                    key={`${windowGroup.sessionName}:${windowGroup.windowIndex}`}
                    className="border-latte-surface2/60 bg-latte-crust/70 rounded-2xl border px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-latte-text truncate text-[12px] font-semibold uppercase tracking-wider">
                          Window {windowGroup.windowIndex}
                        </p>
                        <p className="text-latte-subtext0 truncate text-[10px]">
                          Session {windowGroup.sessionName}
                        </p>
                      </div>
                      <TagPill tone="neutral" className="text-[9px]">
                        {windowGroup.sessions.length} / {groupTotalPanes} panes
                      </TagPill>
                    </div>
                    {shouldRenderLaunchButtons ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <LaunchAgentButton
                          sessionName={windowGroup.sessionName}
                          sourceSession={launchSourceSession}
                          launchConfig={launchConfig}
                          launchPendingSessions={launchPendingSessions}
                          requestWorktrees={requestWorktrees}
                          onLaunchAgentInSession={onLaunchAgentInSession}
                        />
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {windowGroup.sessions.map((item) => (
                        <SessionSidebarItem
                          key={item.paneId}
                          item={item}
                          nowMs={nowMs}
                          isCurrent={currentPaneId === item.paneId}
                          isFocusPending={focusPendingPaneIds.has(item.paneId)}
                          onHoverStart={onHoverStart}
                          onHoverEnd={onHoverEnd}
                          onFocus={onFocus}
                          onBlur={onBlur}
                          onSelect={() => onSelect(item.paneId)}
                          onFocusPane={onFocusPane}
                          onTouchSession={onTouchSession}
                          registerItemRef={registerItemRef}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
