import { Link } from "@tanstack/react-router";
import type { SessionSummary } from "@vde-monitor/shared";
import { Clock, GitBranch, Pin, SquareTerminal } from "lucide-react";
import { type MouseEvent, memo, useCallback } from "react";

import { Badge, IconButton, LastInputPill, TagPill } from "@/components/ui";
import {
  isSessionEditorState,
  resolveSessionDisplayTitle,
} from "@/features/shared-session-ui/model/session-display";
import { resolveSessionSidebarTitleTextClass } from "@/features/shared-session-ui/model/session-title-font";
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
  "relative block w-full overflow-hidden rounded-2xl border border-[var(--material-stroke)] bg-latte-base/48 px-3 py-3.5 text-left shadow-[0_1px_2px_rgb(var(--ctp-shadow)/0.04)] transition-[scale,background-color,border-color,box-shadow] duration-200 ease-out before:absolute before:inset-y-3.5 before:left-0 before:w-[3px] before:rounded-r-full before:content-[''] hover:bg-latte-base/72 hover:shadow-[var(--material-shadow-hover)] active:scale-[0.985] active:duration-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-latte-blue";

const sidebarSessionBorderClassByState: Record<SessionSummary["state"], string> = {
  RUNNING: "before:bg-latte-green",
  WAITING_INPUT: "before:bg-latte-peach",
  WAITING_PERMISSION: "before:bg-latte-red",
  DONE: "before:bg-latte-blue",
  SHELL: "before:bg-latte-blue",
  UNKNOWN: "before:bg-latte-overlay0",
};

const sidebarEditorSessionBorderClass = "before:bg-latte-maroon";
const SIDEBAR_BRANCH_INLINE_MIN_WIDTH = 460;
const SIDEBAR_BRANCH_COMPACT_MAX_WIDTH = 520;
const isMacDesktopPlatform = () =>
  typeof navigator !== "undefined" &&
  /^Mac/i.test(navigator.platform) &&
  navigator.maxTouchPoints <= 1;

type SessionSidebarItemProps = {
  item: SessionSummary;
  sidebarWidth?: number;
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
    sidebarWidth,
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
    const sessionTitleTextClassName = resolveSessionSidebarTitleTextClass(displayTitle);
    const lastInputTone = getLastInputTone(item.lastInputAt ?? null, nowMs);
    const hasKnownAgent = isKnownAgent(item.agent);
    const showEditorState = isSessionEditorState(item);
    const statusMeta = showEditorState
      ? {
          ...statusIconMeta("UNKNOWN"),
          className: "text-latte-maroon-text",
          wrap: "border-latte-maroon/45 bg-latte-maroon/14",
          label: "EDITOR",
        }
      : statusIconMeta(item.state);
    const sessionBorderClass = showEditorState
      ? sidebarEditorSessionBorderClass
      : sidebarSessionBorderClassByState[item.state];
    const StatusIcon = statusMeta.icon;
    const canFocusPane = onFocusPane != null && isMacDesktopPlatform();
    const hasActionButtons = onTouchSession != null || canFocusPane;
    const showBranchInline = (sidebarWidth ?? 0) >= SIDEBAR_BRANCH_INLINE_MIN_WIDTH;
    const compactBranchClass =
      (sidebarWidth ?? 0) < SIDEBAR_BRANCH_COMPACT_MAX_WIDTH
        ? hasKnownAgent
          ? "max-w-[140px]"
          : "max-w-[180px]"
        : "max-w-[220px]";

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
              ? "bg-latte-blue/10 ring-latte-blue/32 hover:bg-latte-blue/14 ring-1 ring-inset"
              : "hover:border-latte-blue/24",
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
            <span
              className={cn(
                "font-ident text-latte-text min-w-0 truncate font-medium tracking-normal",
                sessionTitleTextClassName,
              )}
              title={displayTitle}
            >
              {displayTitle}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <div
              className={cn(
                "flex w-full min-w-0 items-center gap-x-2 gap-y-1.5",
                showBranchInline ? "flex-nowrap" : "flex-wrap",
              )}
            >
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
                className="shrink-0 whitespace-nowrap"
              />
              {showBranchInline ? (
                <TagPill
                  tone="meta"
                  className={cn(
                    "ml-auto inline-flex min-w-0 items-center gap-1",
                    compactBranchClass,
                  )}
                  title={formatBranchLabel(item.branch)}
                >
                  <GitBranch className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate font-mono">{formatBranchLabel(item.branch)}</span>
                </TagPill>
              ) : null}
            </div>
            {!showBranchInline ? <span aria-hidden="true" className="basis-full" /> : null}
            {!showBranchInline ? (
              <TagPill
                tone="meta"
                className={cn("inline-flex items-center gap-1", compactBranchClass)}
                title={formatBranchLabel(item.branch)}
              >
                <GitBranch className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate font-mono">{formatBranchLabel(item.branch)}</span>
              </TagPill>
            ) : null}
          </div>
        </Link>
        {hasActionButtons ? (
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            {onTouchSession ? (
              <IconButton
                type="button"
                size="sm"
                variant="base"
                aria-label="Move pane to top"
                title="Move pane to top"
                className="border-latte-blue/28 bg-latte-base/76 text-latte-blue-text hover:bg-latte-blue/10"
                onClick={handlePinButtonClick}
              >
                <Pin className="h-4 w-4" />
              </IconButton>
            ) : null}
            {canFocusPane ? (
              <IconButton
                type="button"
                size="sm"
                variant="lavender"
                aria-label="Focus terminal pane"
                title="Focus terminal pane"
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
