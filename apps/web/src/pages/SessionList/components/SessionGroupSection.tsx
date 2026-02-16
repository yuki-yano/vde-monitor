import type { LaunchConfig, SessionSummary, WorktreeList } from "@vde-monitor/shared";
import { Clock, FolderGit2, Github, Pin } from "lucide-react";

import { LaunchAgentButton } from "@/components/launch-agent-button";
import { GlassPanel, GlowCard, IconButton, LastInputPill, TagPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { buildGitHubRepoUrl } from "@/lib/github-repo-url";
import {
  formatRelativeTime,
  getLastInputTone,
  isVwManagedWorktreePath,
} from "@/lib/session-format";
import type { SessionGroup } from "@/lib/session-group";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

import { buildSessionWindowGroups, type SessionWindowGroup } from "../session-window-group";
import { formatRepoName, formatRepoPath } from "../sessionListFormat";
import { SessionWindowSection } from "./SessionWindowSection";

type SessionGroupSectionProps = {
  group: SessionGroup;
  nowMs: number;
  allSessions: SessionSummary[];
  launchPendingSessions: Set<string>;
  launchConfig: LaunchConfig;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  onLaunchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void> | void;
  onTouchRepoPin: (repoRoot: string | null) => void;
  onTouchPanePin: (paneId: string) => void;
  onRegisterPaneScrollTarget?: (paneId: string, element: HTMLAnchorElement | null) => void;
};

export const SessionGroupSection = ({
  group,
  nowMs,
  allSessions,
  launchPendingSessions,
  launchConfig,
  requestWorktrees,
  onLaunchAgentInSession,
  onTouchRepoPin,
  onTouchPanePin,
  onRegisterPaneScrollTarget,
}: SessionGroupSectionProps) => {
  const groupTone = getLastInputTone(group.lastInputAt, nowMs);
  const repoName = formatRepoName(group.repoRoot);
  const repoPath = formatRepoPath(group.repoRoot);
  const repoGitHubUrl = buildGitHubRepoUrl(group.repoRoot);
  const repoSessions = allSessions.filter(
    (session) => (session.repoRoot ?? null) === group.repoRoot,
  );
  const totalWindowGroups = buildSessionWindowGroups(repoSessions);
  const totalPaneMap = new Map(
    totalWindowGroups.map((windowGroup) => [
      `${windowGroup.sessionName}:${windowGroup.windowIndex}`,
      windowGroup.sessions.length,
    ]),
  );
  const windowGroups = buildSessionWindowGroups(group.sessions);
  const sessionSections: { sessionName: string; windowGroups: SessionWindowGroup[] }[] = [];
  const bySession = new Map<string, SessionWindowGroup[]>();
  windowGroups.forEach((windowGroup) => {
    const bucket = bySession.get(windowGroup.sessionName) ?? [];
    bucket.push(windowGroup);
    bySession.set(windowGroup.sessionName, bucket);
  });
  bySession.forEach((sessionWindowGroups, sessionName) => {
    sessionSections.push({ sessionName, windowGroups: sessionWindowGroups });
  });

  return (
    <GlowCard contentClassName="gap-1.5 sm:gap-3">
      <GlassPanel
        className="px-2.5 py-2 sm:px-4 sm:py-4"
        contentClassName="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="border-latte-surface2/70 from-latte-crust/70 via-latte-surface0/70 to-latte-mantle/80 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br">
            <div className="bg-latte-lavender/30 pointer-events-none absolute -bottom-3 -right-3 h-8 w-8 rounded-full blur-xl" />
            <FolderGit2 className="text-latte-lavender h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-display text-latte-text truncate text-lg font-semibold leading-snug">
              {repoName}
            </p>
            {repoPath && (
              <p className="text-latte-subtext0 truncate font-mono text-[11px] leading-normal">
                {repoPath}
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-[320px]">
          <TagPill tone="neutral" className="text-[11px]">
            {windowGroups.length} windows
          </TagPill>
          <TagPill tone="neutral" className="text-[11px]">
            {group.sessions.length} panes
          </TagPill>
          <div className="ml-auto flex items-center gap-2">
            {repoGitHubUrl ? (
              <IconButton
                type="button"
                size="xs"
                variant="base"
                aria-label="Open repository on GitHub"
                title="Open repository on GitHub"
                onClick={() => {
                  window.open(repoGitHubUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <Github className="h-3.5 w-3.5" />
              </IconButton>
            ) : null}
            <IconButton
              type="button"
              size="xs"
              variant="base"
              aria-label="Pin repo to top"
              title="Pin repo to top"
              onClick={() => onTouchRepoPin(group.repoRoot)}
            >
              <Pin className="h-3.5 w-3.5" />
            </IconButton>
            <LastInputPill
              tone={groupTone}
              label={<Clock className="h-3 w-3" />}
              srLabel="Latest input"
              value={formatRelativeTime(group.lastInputAt, nowMs)}
              size="xs"
              showDot={false}
              className="text-[10px]"
            />
          </div>
        </div>
      </GlassPanel>
      <div className="pt-1.5 sm:pt-3">
        <div className="flex flex-col gap-2.5 sm:gap-4">
          {sessionSections.map((sessionSection, sessionIndex) => (
            <div
              key={sessionSection.sessionName}
              className={cn(sessionIndex > 0 ? "pt-2.5 sm:pt-4" : null)}
            >
              {(() => {
                const sessionPaneCandidates = sessionSection.windowGroups.flatMap(
                  (windowGroup) => windowGroup.sessions,
                );
                const repoRootPane = sessionPaneCandidates.find((session) => {
                  const repoRoot = session.repoRoot?.trim();
                  const worktreePath = session.worktreePath?.trim();
                  return Boolean(repoRoot && worktreePath && repoRoot === worktreePath);
                });
                const nonWorktreePane = sessionPaneCandidates.find(
                  (session) => !isVwManagedWorktreePath(session.worktreePath),
                );
                const launchSourceSession =
                  repoRootPane ??
                  nonWorktreePane ??
                  sessionPaneCandidates.find((session) => session.paneActive) ??
                  sessionPaneCandidates[0];
                return (
                  <div className="mb-2.5 flex flex-wrap items-center gap-2.5 px-1">
                    <TagPill tone="neutral" className="text-[10px]">
                      Session {sessionSection.sessionName}
                    </TagPill>
                    <div className="ml-auto flex items-center gap-1.5">
                      <LaunchAgentButton
                        sessionName={sessionSection.sessionName}
                        sourceSession={launchSourceSession}
                        launchConfig={launchConfig}
                        launchPendingSessions={launchPendingSessions}
                        requestWorktrees={requestWorktrees}
                        onLaunchAgentInSession={onLaunchAgentInSession}
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2.5 sm:space-y-4">
                {sessionSection.windowGroups.map((windowGroup) => (
                  <SessionWindowSection
                    key={`${windowGroup.sessionName}:${windowGroup.windowIndex}`}
                    group={windowGroup}
                    totalPanes={
                      totalPaneMap.get(`${windowGroup.sessionName}:${windowGroup.windowIndex}`) ??
                      windowGroup.sessions.length
                    }
                    nowMs={nowMs}
                    onTouchPanePin={onTouchPanePin}
                    onRegisterPaneScrollTarget={onRegisterPaneScrollTarget}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlowCard>
  );
};
