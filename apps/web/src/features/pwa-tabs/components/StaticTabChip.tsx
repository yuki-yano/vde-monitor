import { Grid2x2 } from "lucide-react";

import { SYSTEM_CHAT_GRID_TAB_ID, type WorkspaceTab } from "../model/workspace-tabs";

export type StaticTabChipProps = {
  tab: WorkspaceTab;
  label: string;
  active: boolean;
  statusClassName: string;
};

export const StaticTabChip = ({ tab, label, active, statusClassName }: StaticTabChipProps) => {
  return (
    <div className="flex items-center gap-1">
      {tab.id === SYSTEM_CHAT_GRID_TAB_ID && (
        <span className="text-latte-overlay1 inline-flex h-4 w-4 items-center justify-center">
          <Grid2x2 className="h-3 w-3" />
        </span>
      )}
      <div
        className={[
          "border-latte-surface2/70 bg-latte-base/92 text-latte-subtext0 inline-flex min-w-0 items-center gap-1.5 rounded-xl border py-1.5 pl-2 text-[11px] font-semibold",
          active ? "text-latte-text pr-4.5 min-w-[3.8rem]" : "pr-2",
        ].join(" ")}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full border border-white/45 ${statusClassName}`}
          aria-hidden="true"
        />
        <span className="max-w-[5.2rem] truncate">{label}</span>
      </div>
    </div>
  );
};
