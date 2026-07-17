import type { SessionStateValue } from "@vde-monitor/shared";
import { AlertTriangle, CheckCircle, Circle, Clock, Loader2, Sparkles, Zap } from "lucide-react";
import type { ComponentType } from "react";

import { formatRepoDisplayName } from "./repo-display";

type IconMeta = {
  icon: ComponentType<{ className?: string }>;
  className: string;
  wrap: string;
  label: string;
};

export const formatRepoDirLabel = (value: string | null) => formatRepoDisplayName(value);

const STATUS_ICON_META_BY_STATE: Record<SessionStateValue, IconMeta> = {
  RUNNING: {
    icon: Loader2,
    className: "text-latte-green-text animate-spin",
    wrap: "border-latte-green/40 bg-latte-green/10",
    label: "RUNNING",
  },
  WAITING_INPUT: {
    icon: Clock,
    className: "text-latte-peach-text",
    wrap: "border-latte-peach/40 bg-latte-peach/15",
    label: "WAITING_INPUT",
  },
  WAITING_PERMISSION: {
    icon: AlertTriangle,
    className: "text-latte-red-text",
    wrap: "border-latte-red/40 bg-latte-red/15",
    label: "WAITING_PERMISSION",
  },
  DONE: {
    icon: CheckCircle,
    className: "text-latte-blue-text",
    wrap: "border-latte-blue/40 bg-latte-blue/15",
    label: "DONE",
  },
  SHELL: {
    icon: Circle,
    className: "text-latte-blue-text",
    wrap: "border-latte-blue/40 bg-latte-blue/10",
    label: "SHELL",
  },
  UNKNOWN: {
    icon: Circle,
    className: "text-latte-overlay1",
    wrap: "border-latte-surface2/60 bg-latte-crust/60",
    label: "UNKNOWN",
  },
};

export const statusIconMeta = (state: SessionStateValue): IconMeta =>
  STATUS_ICON_META_BY_STATE[state];

export const agentIconMeta = (agent: string | null | undefined): IconMeta => {
  switch (agent) {
    case "codex":
      return {
        icon: Sparkles,
        className: "text-latte-mauve-text",
        wrap: "border-latte-mauve/40 bg-latte-mauve/10",
        label: "CODEX",
      };
    case "claude":
      return {
        icon: Zap,
        className: "text-latte-lavender-text",
        wrap: "border-latte-lavender/40 bg-latte-lavender/10",
        label: "CLAUDE",
      };
    default:
      return {
        icon: Circle,
        className: "text-latte-overlay1",
        wrap: "border-latte-surface2/60 bg-latte-crust/60",
        label: "UNKNOWN",
      };
  }
};
