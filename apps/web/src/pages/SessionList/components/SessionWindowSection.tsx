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
    <InsetPanel className="p-2.5 sm:p-4">
      <div className="flex items-center justify-between gap-2.5 pb-1.5 sm:gap-3 sm:pb-2 sm:pl-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="border-latte-surface2/70 from-latte-crust/70 via-latte-surface0/70 to-latte-mantle/80 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-linear-to-br">
            <div className="bg-latte-sky/25 pointer-events-none absolute -bottom-3 -right-3 h-8 w-8 rounded-full blur-xl" />
            <LayoutGrid className="text-latte-sky h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="font-display text-latte-text truncate text-base font-semibold leading-snug">
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
