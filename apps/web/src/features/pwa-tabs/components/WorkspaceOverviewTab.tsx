import { LayoutPanelTop } from "lucide-react";

import type { WorkspaceTab } from "../model/workspace-tabs";

type WorkspaceOverviewTabProps = {
  tab: WorkspaceTab;
  active: boolean;
  onActivate: (tabId: string) => void;
};

export const WorkspaceOverviewTab = ({ tab, active, onActivate }: WorkspaceOverviewTabProps) => (
  <button
    type="button"
    role="tab"
    style={{ gridColumn: 1, gridRow: 1 }}
    aria-selected={active}
    tabIndex={active ? 0 : -1}
    data-tab-id={tab.id}
    onClick={() => onActivate(tab.id)}
    className={[
      "border-latte-surface2/70 bg-latte-base/88 text-latte-subtext0 hover:text-latte-text hover:border-latte-lavender/60 inline-flex min-w-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-semibold transition",
      "data-[active=true]:bg-latte-lavender/18 data-[active=true]:text-latte-text data-[active=true]:border-latte-blue/85 data-[active=true]:shadow-accent-outline data-[active=true]:font-bold",
    ].join(" ")}
    data-active={active ? "true" : "false"}
  >
    <span className="bg-latte-blue/85 h-2.5 w-2.5 rounded-full border border-white/45" />
    <LayoutPanelTop className="h-3.5 w-3.5" />
    <span>S</span>
  </button>
);
