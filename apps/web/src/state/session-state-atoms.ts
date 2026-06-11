import type {
  ClientFileNavigatorConfig,
  HighlightCorrectionConfig,
  LaunchConfig,
  WorkspaceTabsDisplayMode,
} from "@vde-monitor/shared";
import { atom } from "jotai";

import { defaultLaunchConfig } from "./launch-agent-options";

export type SessionConnectionStatus = "healthy" | "degraded" | "disconnected";

export const sessionHighlightCorrectionsAtom = atom<HighlightCorrectionConfig>({
  codex: true,
  claude: true,
});
export const sessionFileNavigatorConfigAtom = atom<ClientFileNavigatorConfig>({
  autoExpandMatchLimit: 100,
});
export const sessionWorkspaceTabsDisplayModeAtom = atom<WorkspaceTabsDisplayMode>("all");
export const sessionLaunchConfigAtom = atom<LaunchConfig>(defaultLaunchConfig);
