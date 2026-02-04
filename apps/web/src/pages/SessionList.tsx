import { Link, useNavigate } from "@tanstack/react-router";
import { Clock, FolderGit2, MonitorX, RefreshCw, Search } from "lucide-react";
import { type CSSProperties, useCallback, useMemo, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  Badge,
  Button,
  Callout,
  Card,
  ConnectionStatusPill,
  EmptyCard,
  FilterToggleGroup,
  GlassPanel,
  GlowCard,
  LastInputPill,
  TagPill,
  Toolbar,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  agentLabelFor,
  agentToneFor,
  formatPath,
  formatRelativeTime,
  getLastInputTone,
  stateTone,
} from "@/lib/session-format";
import { buildSessionGroups } from "@/lib/session-group";
import { useNowMs } from "@/lib/use-now-ms";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import { LogModal } from "./SessionDetail/components/LogModal";
import { QuickPanel } from "./SessionDetail/components/QuickPanel";
import { SessionSidebar } from "./SessionDetail/components/SessionSidebar";
import { useSessionLogs } from "./SessionDetail/hooks/useSessionLogs";

const formatRepoName = (value: string | null) => {
  if (!value) return "No repo";
  // パスの最後のセグメント（リポジトリ名）を取得
  const segments = value.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "Unknown";
};

const formatRepoPath = (value: string | null) => {
  if (!value) return null;
  return formatPath(value);
};

export const SessionListPage = () => {
  const {
    sessions,
    connected,
    connectionIssue,
    readOnly,
    reconnect,
    refreshSessions,
    requestScreen,
    highlightCorrections,
  } = useSessions();
  const [filter, setFilter] = useState("ALL");
  const nowMs = useNowMs();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { sidebarWidth, handlePointerDown } = useSidebarWidth();

  const filtered = useMemo(() => {
    return sessions.filter((session) => {
      const matchesFilter = filter === "ALL" || session.state === filter;
      return matchesFilter;
    });
  }, [filter, sessions]);

  const groups = useMemo(() => buildSessionGroups(filtered), [filtered]);
  const quickPanelGroups = useMemo(() => buildSessionGroups(sessions), [sessions]);

  const {
    quickPanelOpen,
    logModalOpen,
    selectedPaneId,
    selectedSession,
    selectedLogLines,
    selectedLogLoading,
    selectedLogError,
    openLogModal,
    closeLogModal,
    toggleQuickPanel,
    closeQuickPanel,
  } = useSessionLogs({
    connected,
    connectionIssue,
    sessions,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const handleOpenInNewTab = useCallback(() => {
    if (!selectedPaneId) return;
    const encoded = encodeURIComponent(selectedPaneId);
    window.open(`/sessions/${encoded}`, "_blank", "noopener,noreferrer");
  }, [selectedPaneId]);

  const handleOpenHere = useCallback(() => {
    if (!selectedPaneId) return;
    closeQuickPanel();
    navigate({ to: "/sessions/$paneId", params: { paneId: selectedPaneId } });
    closeLogModal();
  }, [closeLogModal, closeQuickPanel, navigate, selectedPaneId]);

  return (
    <>
      <div
        className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        <SessionSidebar
          sessionGroups={quickPanelGroups}
          nowMs={nowMs}
          currentPaneId={null}
          className="border-latte-surface1/80 h-full w-full rounded-none rounded-r-3xl border-r"
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
          onPointerDown={handlePointerDown}
        />
      </div>

      <div
        className="animate-fade-in-up w-full px-4 pb-10 pt-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <div className="flex items-center justify-between gap-3">
          <div />
          <ThemeToggle />
        </div>
        <header className="shadow-glass border-latte-surface1/60 bg-latte-base/80 animate-fade-in stagger-1 flex flex-col gap-4 rounded-3xl border p-6 opacity-0 backdrop-blur">
          <Toolbar className="gap-3">
            <div>
              <p className="text-latte-subtext0 text-xs uppercase tracking-[0.5em]">vde-monitor</p>
              <h1 className="font-display text-latte-text text-4xl font-semibold tracking-tight">
                Live Sessions
              </h1>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-3">
                <ConnectionStatusPill connected={connected} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (connected ? refreshSessions() : reconnect())}
                  aria-label={connected ? "Refresh" : "Reconnect"}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sr-only">{connected ? "Refresh" : "Reconnect"}</span>
                </Button>
              </div>
            </div>
          </Toolbar>
          <FilterToggleGroup
            value={filter}
            onChange={setFilter}
            buttonClassName="uppercase tracking-[0.14em] text-[11px] px-3 py-1"
            options={["ALL", "RUNNING", "WAITING_INPUT", "WAITING_PERMISSION", "UNKNOWN"].map(
              (state) => ({
                value: state,
                label: state.replace("_", " "),
              }),
            )}
          />
          {readOnly && (
            <Callout tone="warning" size="sm">
              Read-only mode is active. Actions are disabled.
            </Callout>
          )}
          {connectionIssue && (
            <Callout tone="warning" size="sm">
              {connectionIssue}
            </Callout>
          )}
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {sessions.length === 0 && (
              <EmptyCard
                icon={<MonitorX className="text-latte-overlay1 h-10 w-10" />}
                title="No Active Sessions"
                description="Start a tmux session with Codex or Claude Code to see it here. Sessions will appear automatically when detected."
                className="py-16"
                iconWrapperClassName="bg-latte-surface1/50 h-20 w-20"
                titleClassName="text-xl"
                descriptionClassName="max-w-sm"
                action={
                  <Button variant="ghost" size="sm" onClick={refreshSessions} className="mt-2">
                    <RefreshCw className="h-4 w-4" />
                    Check Again
                  </Button>
                }
              />
            )}
            {sessions.length > 0 && groups.length === 0 && (
              <EmptyCard
                icon={<Search className="text-latte-overlay1 h-8 w-8" />}
                title="No Matching Sessions"
                description="No sessions match the selected filter. Try selecting a different status."
                className="py-12"
                iconWrapperClassName="bg-latte-surface1/50 h-16 w-16"
                titleClassName="text-lg"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilter("ALL")}
                    className="mt-2"
                  >
                    Show All Sessions
                  </Button>
                }
              />
            )}
            {groups.map((group) => {
              const groupTone = getLastInputTone(group.lastInputAt, nowMs);
              const repoName = formatRepoName(group.repoRoot);
              const repoPath = formatRepoPath(group.repoRoot);
              return (
                <GlowCard key={group.repoRoot ?? "no-repo"} contentClassName="gap-3 sm:gap-4">
                  <GlassPanel
                    className="px-4 py-3 sm:px-5 sm:py-4"
                    contentClassName="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {/* 左: リポジトリ情報 */}
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="border-latte-surface2/70 from-latte-crust/70 via-latte-surface0/70 to-latte-mantle/80 relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br">
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

                    {/* 右: メトリクス */}
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <TagPill tone="neutral" className="text-[11px]">
                        {group.sessions.length} sessions
                      </TagPill>
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
                  </GlassPanel>
                  <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {group.sessions.map((session) => {
                      const sessionTone = getLastInputTone(session.lastInputAt, nowMs);
                      return (
                        <Link
                          key={session.paneId}
                          to="/sessions/$paneId"
                          params={{ paneId: session.paneId }}
                          className="group"
                        >
                          <Card
                            interactive
                            className={cn(
                              "relative flex h-full flex-col overflow-hidden p-4 transition-all",
                              session.state === "RUNNING" &&
                                "border-green-500/50 shadow-lg shadow-green-500/10",
                              session.state === "WAITING_INPUT" &&
                                "border-amber-500/50 shadow-lg shadow-amber-500/10",
                              session.state === "WAITING_PERMISSION" &&
                                "border-red-500/50 shadow-lg shadow-red-500/10",
                              session.state === "UNKNOWN" &&
                                "border-gray-400/50 shadow-lg shadow-gray-400/10",
                            )}
                          >
                            {/* 背景グロー */}
                            <div
                              className={cn(
                                "pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br to-transparent opacity-50",
                                session.state === "RUNNING" && "from-green-500/5",
                                session.state === "WAITING_INPUT" && "from-amber-500/5",
                                session.state === "WAITING_PERMISSION" && "from-red-500/5",
                                session.state === "UNKNOWN" && "from-gray-400/5",
                              )}
                            />

                            {/* セクション1: ステータスバー */}
                            <div className="relative flex flex-wrap items-center gap-2">
                              <Badge tone={stateTone(session.state)} size="sm">
                                {session.state.replace(/_/g, " ")}
                              </Badge>
                              <Badge tone={agentToneFor(session.agent)} size="sm">
                                {agentLabelFor(session.agent)}
                              </Badge>
                              {session.pipeConflict && (
                                <TagPill tone="danger" className="text-[9px]">
                                  Conflict
                                </TagPill>
                              )}
                              <span className="ml-auto">
                                <LastInputPill
                                  tone={sessionTone}
                                  label={<Clock className="h-2.5 w-2.5" />}
                                  srLabel="Last input"
                                  value={formatRelativeTime(session.lastInputAt, nowMs)}
                                  size="sm"
                                  showDot={false}
                                />
                              </span>
                            </div>

                            {/* セクション2: メインコンテンツ */}
                            <div className="relative mt-2.5 flex min-w-0 flex-1 flex-col">
                              <h3 className="font-display text-latte-text truncate text-[15px] font-semibold leading-snug">
                                {session.customTitle ?? session.title ?? session.sessionName}
                              </h3>
                              <p
                                className="text-latte-subtext0 mt-1.5 line-clamp-2 font-mono text-[11px] leading-normal tracking-tight"
                                title={session.currentPath ?? undefined}
                              >
                                {formatPath(session.currentPath)}
                              </p>
                              {session.lastMessage && (
                                <p className="text-latte-overlay1 mt-2.5 line-clamp-2 text-[11px] leading-relaxed">
                                  {session.lastMessage}
                                </p>
                              )}
                            </div>

                            {/* セクション3: メタ情報フッター */}
                            <div className="border-latte-surface1/30 relative mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                              <TagPill tone="meta">Session {session.sessionName}</TagPill>
                              <TagPill tone="meta">Window {session.windowIndex}</TagPill>
                              <TagPill tone="meta">Pane {session.paneId}</TagPill>
                            </div>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </GlowCard>
              );
            })}
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <QuickPanel
          open={quickPanelOpen}
          sessionGroups={quickPanelGroups}
          nowMs={nowMs}
          currentPaneId={null}
          onOpenLogModal={openLogModal}
          onClose={closeQuickPanel}
          onToggle={toggleQuickPanel}
        />
      </div>

      <LogModal
        open={logModalOpen}
        session={selectedSession}
        logLines={selectedLogLines}
        loading={selectedLogLoading}
        error={selectedLogError}
        onClose={closeLogModal}
        onOpenHere={handleOpenHere}
        onOpenNewTab={handleOpenInNewTab}
      />
    </>
  );
};
