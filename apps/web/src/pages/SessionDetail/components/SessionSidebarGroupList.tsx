import { Pin } from "lucide-react";

import { IconButton, TagPill } from "@/components/ui";
import { formatRepoDirLabel } from "@/lib/quick-panel-utils";
import type { SessionGroup } from "@/lib/session-group";
import type { SessionWindowGroup } from "@/pages/SessionList/session-window-group";

import { SessionSidebarItem } from "./SessionSidebarItem";

type SidebarRepoGroup = {
  repoRoot: SessionGroup["repoRoot"];
  windowGroups: SessionWindowGroup[];
};

type SessionSidebarGroupListProps = {
  sidebarGroups: SidebarRepoGroup[];
  nowMs: number;
  currentPaneId?: string | null;
  focusPendingPaneIds: Set<string>;
  onHoverStart: (paneId: string) => void;
  onHoverEnd: (paneId: string) => void;
  onFocus: (paneId: string) => void;
  onBlur: (paneId: string) => void;
  onSelect: (paneId: string) => void;
  onFocusPane: (paneId: string) => Promise<void> | void;
  onTouchSession: (paneId: string) => void;
  onTouchRepoPin: (repoRoot: string | null) => void;
  registerItemRef: (paneId: string, node: HTMLDivElement | null) => void;
};

export const SessionSidebarGroupList = ({
  sidebarGroups,
  nowMs,
  currentPaneId,
  focusPendingPaneIds,
  onHoverStart,
  onHoverEnd,
  onFocus,
  onBlur,
  onSelect,
  onFocusPane,
  onTouchSession,
  onTouchRepoPin,
  registerItemRef,
}: SessionSidebarGroupListProps) => {
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
              <div className="flex items-center gap-2">
                <span className="bg-latte-lavender/70 h-2 w-2 rounded-full shadow-[0_0_8px_rgba(114,135,253,0.5)]" />
                <span className="text-latte-lavender/80 text-[11px] font-semibold uppercase tracking-wider">
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
              {group.windowGroups.map((windowGroup) => (
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
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
