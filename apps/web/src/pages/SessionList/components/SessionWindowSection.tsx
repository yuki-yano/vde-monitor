import { LayoutGrid } from "lucide-react";

import { InsetPanel, TagPill } from "@/components/ui";
import { PaneGridLayout } from "@/features/shared-session-ui/components/PaneGridLayout";

import { type SessionWindowGroup } from "../session-window-group";
import { SessionCard } from "./SessionCard";

type SessionWindowSectionProps = {
  group: SessionWindowGroup;
  totalPanes: number;
  nowMs: number;
  onTouchPanePin: (paneId: string) => void;
  onRegisterPaneScrollTarget?: (paneId: string, element: HTMLAnchorElement | null) => void;
};

export const SessionWindowSection = ({
  group,
  totalPanes,
  nowMs,
  onTouchPanePin,
  onRegisterPaneScrollTarget,
}: SessionWindowSectionProps) => {
  return (
    <InsetPanel className="@container p-2.5 sm:p-4">
      <div className="flex items-center justify-between gap-2.5 pb-1.5 sm:gap-3 sm:pb-2 sm:pl-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="border-latte-surface2/45 bg-latte-base/55 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_var(--material-highlight)]">
            <LayoutGrid className="text-latte-subtext0 h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="font-ident text-latte-text truncate text-base font-medium leading-snug tracking-normal">
              Window {group.windowIndex}
            </p>
            <p className="text-latte-subtext0 truncate font-mono text-[11px] leading-normal">
              Session {group.sessionName}
            </p>
          </div>
        </div>
        <TagPill tone="neutral" className="ml-auto shrink-0 whitespace-nowrap text-[11px]">
          {group.sessions.length} / {totalPanes} panes
        </TagPill>
      </div>
      <PaneGridLayout responsivePreset="session-list" className="mt-1.5 sm:mt-2">
        {group.sessions.map((session) => (
          <SessionCard
            key={session.paneId}
            session={session}
            nowMs={nowMs}
            onTouchPin={onTouchPanePin}
            onRegisterScrollTarget={onRegisterPaneScrollTarget}
          />
        ))}
      </PaneGridLayout>
    </InsetPanel>
  );
};
