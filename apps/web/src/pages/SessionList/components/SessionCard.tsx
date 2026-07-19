import { Link } from "@tanstack/react-router";
import type { SessionSummary } from "@vde-monitor/shared";
import { Clock, GitBranch, Pin } from "lucide-react";
import { type MouseEvent, memo } from "react";

import { Badge, Card, IconButton, LastInputPill, TagPill } from "@/components/ui";
import {
  isSessionEditorState,
  resolveSessionDisplayTitle,
  resolveSessionStateLabel,
  resolveSessionStateTone,
} from "@/features/shared-session-ui/model/session-display";
import { resolveSessionCardTitleTextClass } from "@/features/shared-session-ui/model/session-title-font";
import { cn } from "@/lib/cn";
import {
  agentLabelFor,
  agentToneFor,
  formatBranchLabel,
  formatPath,
  formatRelativeTime,
  getLastInputTone,
  isKnownAgent,
} from "@/lib/session-format";

type SessionCardProps = {
  session: SessionSummary;
  nowMs: number;
  onTouchPin?: (paneId: string) => void;
  onRegisterScrollTarget?: (paneId: string, element: HTMLAnchorElement | null) => void;
};

const sessionStateStyles: Record<
  SessionSummary["state"],
  {
    card: string;
  }
> = {
  RUNNING: {
    card: "before:bg-latte-green",
  },
  WAITING_INPUT: {
    card: "before:bg-latte-peach",
  },
  WAITING_PERMISSION: {
    card: "before:bg-latte-red",
  },
  DONE: {
    card: "before:bg-latte-blue",
  },
  SHELL: {
    card: "before:bg-latte-blue",
  },
  UNKNOWN: {
    card: "before:bg-latte-overlay0",
  },
};

const editorSessionStyle = {
  card: "before:bg-latte-maroon",
} as const;

const SessionCardComponent = ({
  session,
  nowMs,
  onTouchPin,
  onRegisterScrollTarget,
}: SessionCardProps) => {
  const sessionTone = getLastInputTone(session.lastInputAt, nowMs);
  const sessionTitle = resolveSessionDisplayTitle(session);
  const titleTextClassName = resolveSessionCardTitleTextClass(sessionTitle);
  const showAgentBadge = isKnownAgent(session.agent);
  const showEditorState = isSessionEditorState(session);
  const stateStyle = showEditorState ? editorSessionStyle : sessionStateStyles[session.state];
  const stateBadgeTone = resolveSessionStateTone(session);
  const stateBadgeLabel = resolveSessionStateLabel(session);
  const handlePinClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onTouchPin?.(session.paneId);
  };

  return (
    <Link
      to="/sessions/$paneId"
      params={{ paneId: session.paneId }}
      ref={(element) => onRegisterScrollTarget?.(session.paneId, element)}
      data-pane-scroll-key={session.paneId}
      className="group block w-full min-w-0 max-w-full"
    >
      <Card
        interactive
        className={cn(
          "relative flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:opacity-[0.65] before:content-[''] sm:p-4",
          stateStyle.card,
        )}
      >
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Badge tone={stateBadgeTone} size="sm">
              {stateBadgeLabel}
            </Badge>
            {showAgentBadge && (
              <Badge tone={agentToneFor(session.agent)} size="sm">
                {agentLabelFor(session.agent)}
              </Badge>
            )}
            {session.pipeConflict && (
              <TagPill tone="danger" className="text-[9px]">
                Conflict
              </TagPill>
            )}
          </div>
          <span className="self-center justify-self-end">
            <LastInputPill
              tone={sessionTone}
              label={<Clock className="h-2.5 w-2.5" />}
              srLabel="Last input"
              value={formatRelativeTime(session.lastInputAt, nowMs)}
              size="xs"
              showDot={false}
            />
          </span>
        </div>

        <div className="relative mt-2 flex min-w-0 flex-1 flex-col sm:mt-2.5">
          <h3
            className={cn(
              "font-ident text-latte-text block w-full max-w-full truncate font-medium leading-snug tracking-normal",
              titleTextClassName,
            )}
            title={sessionTitle}
          >
            {sessionTitle}
          </h3>
          <p
            className="text-latte-subtext0 mt-1 line-clamp-2 font-mono text-[11px] leading-normal tracking-tight"
            title={session.currentPath ?? undefined}
          >
            {formatPath(session.currentPath)}
          </p>
          {session.lastMessage && (
            <p
              className="text-latte-subtext0 mt-2.5 line-clamp-2 text-[11px] leading-relaxed"
              title={session.lastMessage}
            >
              {session.lastMessage}
            </p>
          )}
        </div>

        <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 sm:mt-3 sm:pt-2.5">
          <TagPill
            tone="meta"
            className="inline-flex max-w-[160px] items-center gap-1"
            title={formatBranchLabel(session.branch)}
          >
            <GitBranch className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate font-mono">{formatBranchLabel(session.branch)}</span>
          </TagPill>
          <TagPill tone="meta">Pane {session.paneId}</TagPill>
          {onTouchPin ? (
            <IconButton
              type="button"
              size="xs"
              variant="base"
              className="ml-auto"
              aria-label="Move pane to top"
              title="Move pane to top"
              onClick={handlePinClick}
            >
              <Pin className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
        </div>
      </Card>
    </Link>
  );
};

// Session references are preserved by the store when content is unchanged,
// so a shallow memo skips re-rendering untouched cards on every stream update.
export const SessionCard = memo(SessionCardComponent);
