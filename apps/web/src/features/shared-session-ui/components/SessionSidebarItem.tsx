import { Link } from "@tanstack/react-router";
import type { SessionSummary } from "@vde-monitor/shared";
import { Clock, GitBranch, Pin, SquareTerminal } from "lucide-react";
import { memo, type MouseEvent, useCallback } from "react";

import { Badge, IconButton, LastInputPill, TagPill } from "@/components/ui";
import {
  isSessionEditorState,
  resolveSessionDisplayTitle,
} from "@/features/shared-session-ui/model/session-display";
import { cn } from "@/lib/cn";
import { statusIconMeta } from "@/lib/quick-panel-utils";
import {
  agentLabelFor,
  agentToneFor,
  formatBranchLabel,
  formatRelativeTime,
  getLastInputTone,
  isKnownAgent,
} from "@/lib/session-format";

const surfaceLinkClass =
  "border-latte-surface2/70 bg-latte-base/70 focus-visible:ring-latte-lavender block w-full rounded-2xl border px-3 py-3.5 text-left transition-all duration-200 hover:border-latte-lavender/50 hover:bg-latte-mantle/70 hover:shadow-surface-hover focus-visible:outline-none focus-visible:ring-2";

const sidebarSessionBorderClassByState: Record<SessionSummary["state"], string> = {
  RUNNING: "border-green-500/50",
  WAITING_INPUT: "border-amber-500/50",
  WAITING_PERMISSION: "border-red-500/50",
  SHELL: "border-blue-500/50",
  UNKNOWN: "border-gray-400/50",
};

const sidebarEditorSessionBorderClass = "border-latte-maroon/55";

type SessionSidebarItemProps = {
  item: SessionSummary;
  nowMs: number;
  isCurrent: boolean;
  isFocusPending: boolean;
  onHoverStart: (paneId: string) => void;
  onHoverEnd: (paneId: string) => void;
  onFocus: (paneId: string) => void;
  onBlur: (paneId: string) => void;
  onSelect: () => void;
  onFocusPane?: (paneId: string) => Promise<void> | void;
  onTouchSession?: (paneId: string) => void;
  registerItemRef: (paneId: string, node: HTMLDivElement | null) => void;
};

export const SessionSidebarItem = memo(
  ({
    item,
    nowMs,
    isCurrent,
    isFocusPending,
    onHoverStart,
    onHoverEnd,
    onFocus,
    onBlur,
    onSelect,
    onFocusPane,
    onTouchSession,
    registerItemRef,
  }: SessionSidebarItemProps) => {
    const displayTitle = resolveSessionDisplayTitle(item);
    const lastInputTone = getLastInputTone(item.lastInputAt ?? null, nowMs);
    const hasKnownAgent = isKnownAgent(item.agent);
    const showEditorState = isSessionEditorState(item);
    const statusMeta = showEditorState
      ? {
          ...statusIconMeta("UNKNOWN"),
          className: "text-latte-maroon",
          wrap: "border-latte-maroon/45 bg-latte-maroon/14",
          label: "EDITOR",
        }
      : statusIconMeta(item.state);
    const sessionBorderClass = showEditorState
      ? sidebarEditorSessionBorderClass
      : sidebarSessionBorderClassByState[item.state];
    const StatusIcon = statusMeta.icon;

    const handleRef = useCallback(
      (node: HTMLDivElement | null) => {
        registerItemRef(item.paneId, node);
      },
      [item.paneId, registerItemRef],
    );

    const handleMouseEnter = useCallback(() => {
      if (!isCurrent) {
        onHoverStart(item.paneId);
      }
    }, [isCurrent, item.paneId, onHoverStart]);

    const handleMouseLeave = useCallback(() => {
      onHoverEnd(item.paneId);
    }, [item.paneId, onHoverEnd]);

    const handleFocus = useCallback(() => {
      if (!isCurrent) {
        onFocus(item.paneId);
      }
    }, [isCurrent, item.paneId, onFocus]);

    const handleBlur = useCallback(() => {
      onBlur(item.paneId);
    }, [item.paneId, onBlur]);

    const handleFocusButtonClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!onFocusPane || isFocusPending) {
          return;
        }
        void onFocusPane(item.paneId);
      },
      [isFocusPending, item.paneId, onFocusPane],
    );

    const handlePinButtonClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onTouchSession?.(item.paneId);
      },
      [item.paneId, onTouchSession],
    );

    return (
      <div
        className="flex items-center gap-2"
        ref={handleRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={handleFocus}
        onBlurCapture={handleBlur}
      >
        <Link
          to="/sessions/$paneId"
          params={{ paneId: item.paneId }}
          aria-current={isCurrent ? "page" : undefined}
          onClick={onSelect}
          className={cn(
            surfaceLinkClass,
            "min-w-0 flex-1 flex-col gap-3",
            sessionBorderClass,
            isCurrent
              ? "bg-latte-lavender/20 ring-latte-lavender/40 hover:bg-latte-lavender/25 shadow-accent ring-1 ring-inset"
              : "hover:border-latte-lavender/60 hover:bg-latte-lavender/10",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border",
                statusMeta.wrap,
              )}
              aria-label={statusMeta.label}
            >
              <StatusIcon className={cn("h-3.5 w-3.5", statusMeta.className)} />
            </span>
            <span className="text-latte-text min-w-0 truncate text-sm font-semibold">
              {displayTitle}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              {hasKnownAgent ? (
                <Badge tone={agentToneFor(item.agent)} size="sm">
                  {agentLabelFor(item.agent)}
                </Badge>
              ) : null}
              <LastInputPill
                tone={lastInputTone}
                label={<Clock className="h-3 w-3" />}
                srLabel="Last input"
                value={formatRelativeTime(item.lastInputAt, nowMs)}
                size="xs"
                showDot={false}
              />
            </div>
            <span aria-hidden="true" className="basis-full" />
            <TagPill tone="meta" className="inline-flex max-w-[220px] items-center gap-1">
              <GitBranch className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate font-mono">{formatBranchLabel(item.branch)}</span>
            </TagPill>
          </div>
        </Link>
        {onTouchSession || onFocusPane ? (
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            {onTouchSession ? (
              <IconButton
                type="button"
                size="md"
                variant="base"
                aria-label="Pin pane to top"
                title="Pin pane to top"
                className="border-latte-lavender/35 bg-latte-base/90 text-latte-lavender hover:bg-latte-lavender/12 h-8 w-8"
                onClick={handlePinButtonClick}
              >
                <Pin className="h-4 w-4" />
              </IconButton>
            ) : null}
            {onFocusPane ? (
              <IconButton
                type="button"
                size="md"
                variant="lavender"
                aria-label="Focus terminal pane"
                title="Focus terminal pane"
                className="h-8 w-8"
                onClick={handleFocusButtonClick}
                disabled={isFocusPending}
              >
                <SquareTerminal className="h-4 w-4" />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

SessionSidebarItem.displayName = "SessionSidebarItem";
