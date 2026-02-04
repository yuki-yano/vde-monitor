import { Clock, List, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge, Card, IconButton, LastInputPill, SurfaceButton } from "@/components/ui";
import { formatRepoDirLabel, statusIconMeta } from "@/lib/quick-panel-utils";
import type { SessionGroup } from "@/lib/session-group";

import {
  agentLabelFor,
  agentToneFor,
  formatRelativeTime,
  getLastInputTone,
} from "../sessionDetailUtils";

type QuickPanelState = {
  open: boolean;
  sessionGroups: SessionGroup[];
  nowMs: number;
  currentPaneId?: string | null;
};

type QuickPanelActions = {
  onOpenLogModal: (paneId: string) => void;
  onClose: () => void;
  onToggle: () => void;
};

type QuickPanelProps = {
  state: QuickPanelState;
  actions: QuickPanelActions;
};

export const QuickPanel = ({ state, actions }: QuickPanelProps) => {
  const { open, sessionGroups, nowMs, currentPaneId } = state;
  const { onOpenLogModal, onClose, onToggle } = actions;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    const target = scrollRef.current;
    if (!target) return;
    const handleWheel = (event: WheelEvent) => {
      const { scrollHeight, clientHeight, scrollTop } = target;
      if (scrollHeight <= clientHeight) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.deltaY < 0 && scrollTop <= 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.deltaY > 0 && scrollTop + clientHeight >= scrollHeight) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchStartYRef.current = touch.clientY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const startY = touchStartYRef.current;
      if (startY === null) return;
      const currentY = touch.clientY;
      const deltaY = startY - currentY;
      const { scrollHeight, clientHeight, scrollTop } = target;
      if (scrollHeight <= clientHeight) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (deltaY < 0 && scrollTop <= 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (deltaY > 0 && scrollTop + clientHeight >= scrollHeight) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    target.addEventListener("wheel", handleWheel, { passive: false });
    target.addEventListener("touchstart", handleTouchStart, { passive: true });
    target.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      target.removeEventListener("wheel", handleWheel);
      target.removeEventListener("touchstart", handleTouchStart);
      target.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  return (
    <div className="fixed bottom-4 left-6 z-40 flex flex-col items-start gap-3">
      {open && (
        <Card className="font-body animate-panel-enter border-latte-lavender/30 bg-latte-mantle/85 relative flex max-h-[80dvh] w-[calc(100vw-3rem)] max-w-[320px] flex-col overflow-hidden rounded-3xl border-2 p-4 shadow-[0_25px_80px_-20px_rgba(114,135,253,0.4),0_0_0_1px_rgba(114,135,253,0.15)] ring-1 ring-inset ring-white/10 backdrop-blur-xl">
          <IconButton
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3"
            variant="lavender"
            size="sm"
            aria-label="Close quick panel"
          >
            <X className="h-4 w-4" />
          </IconButton>
          <div
            ref={scrollRef}
            className="custom-scrollbar -mr-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4"
          >
            <div className="space-y-3 pr-5">
              {sessionGroups.length === 0 && (
                <div className="border-latte-lavender/20 bg-latte-crust/50 text-latte-subtext0 rounded-2xl border px-3 py-4 text-center text-xs">
                  No sessions available.
                </div>
              )}
              {sessionGroups.map((group) => (
                <div key={group.repoRoot ?? "no-repo"} className="space-y-2">
                  <div className="text-latte-lavender/70 px-2 text-[11px] font-semibold uppercase tracking-wider">
                    {formatRepoDirLabel(group.repoRoot)}
                  </div>
                  <div className="space-y-2">
                    {group.sessions.map((item) => {
                      const displayTitle = item.customTitle ?? item.title ?? item.sessionName;
                      const lastInputTone = getLastInputTone(item.lastInputAt ?? null, nowMs);
                      const statusMeta = statusIconMeta(item.state);
                      const StatusIcon = statusMeta.icon;
                      const isCurrent = currentPaneId === item.paneId;
                      return (
                        <SurfaceButton
                          key={item.paneId}
                          type="button"
                          onClick={() => onOpenLogModal(item.paneId)}
                          aria-current={isCurrent ? "true" : undefined}
                          className={`flex flex-col gap-2 ${
                            isCurrent
                              ? "border-latte-lavender/70 bg-latte-lavender/10 shadow-[0_0_0_1px_rgba(114,135,253,0.35),0_10px_20px_-12px_rgba(114,135,253,0.35)]"
                              : ""
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${statusMeta.wrap}`}
                              aria-label={statusMeta.label}
                            >
                              <StatusIcon className={`h-3.5 w-3.5 ${statusMeta.className}`} />
                            </span>
                            <span className="text-latte-text min-w-0 truncate text-sm font-semibold">
                              {displayTitle}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={agentToneFor(item.agent)} size="sm">
                              {agentLabelFor(item.agent)}
                            </Badge>
                            <LastInputPill
                              tone={lastInputTone}
                              label={<Clock className="h-3 w-3" />}
                              srLabel="Last input"
                              value={formatRelativeTime(item.lastInputAt, nowMs)}
                              size="xs"
                              showDot={false}
                            />
                          </div>
                        </SurfaceButton>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      <IconButton
        type="button"
        onClick={onToggle}
        variant="lavenderStrong"
        size="lg"
        aria-label="Toggle session quick panel"
      >
        <List className="h-5 w-5" />
      </IconButton>
    </div>
  );
};
