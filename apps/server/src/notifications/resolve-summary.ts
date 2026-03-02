import type { AgentMonitorConfig, SummaryPublishLocator } from "@vde-monitor/shared";

import type { SummaryBus } from "./summary-bus";
import type { SessionTransitionEvent } from "./types";

type ResolveSummaryDisabled = {
  result: "disabled";
  reasonCode: "disabled";
  waitedMs: 0;
};

type ResolveSummaryTimeout = {
  result: "timeout";
  reasonCode: "timeout";
  waitedMs: number;
};

type ResolveSummaryRejected = {
  result: "rejected";
  reasonCode: "waiter_overflow";
  waitedMs: number;
};

type ResolveSummaryHit = {
  result: "hit";
  reasonCode: "hit";
  waitedMs: number;
  event: {
    eventId: string;
    locator: SummaryPublishLocator;
    summary: {
      paneTitle: string;
      notificationTitle: string;
      notificationBody: string;
    };
  };
};

export type ResolveSummaryResult =
  | ResolveSummaryDisabled
  | ResolveSummaryTimeout
  | ResolveSummaryRejected
  | ResolveSummaryHit;

type CreateResolveSummaryOptions = {
  config: AgentMonitorConfig;
  summaryBus: SummaryBus;
  nowMs?: () => number;
};

const resolveSummarySource = (event: SessionTransitionEvent): "codex" | "claude" | null => {
  if (event.next.agent === "codex" || event.next.agent === "claude") {
    return event.next.agent;
  }
  return null;
};

const normalizeRunId = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
};

const resolveRunId = (event: SessionTransitionEvent, source: "codex" | "claude"): string => {
  if (source === "claude") {
    return normalizeRunId(event.next.agentSessionId) ?? event.next.paneId;
  }
  return event.next.paneId;
};

const resolveSequence = (eventAt: string, fallbackNowMs: number): number => {
  const parsed = Date.parse(eventAt);
  const epochMs = Number.isFinite(parsed) ? parsed : fallbackNowMs;
  return Math.max(1, Math.floor(epochMs));
};

export const createResolveSummary = ({
  config,
  summaryBus,
  nowMs = () => Date.now(),
}: CreateResolveSummaryOptions) => {
  const resolveSummary = async (event: SessionTransitionEvent): Promise<ResolveSummaryResult> => {
    const source = resolveSummarySource(event);
    if (!source) {
      return {
        result: "disabled",
        reasonCode: "disabled",
        waitedMs: 0,
      };
    }

    if (!config.notifications.summary.enabled || !config.notifications.summary.rename.push) {
      return {
        result: "disabled",
        reasonCode: "disabled",
        waitedMs: 0,
      };
    }

    const sourceConfig = config.notifications.summary.sources[source];
    if (!sourceConfig.enabled) {
      return {
        result: "disabled",
        reasonCode: "disabled",
        waitedMs: 0,
      };
    }

    const runId = resolveRunId(event, source);
    const sequence = resolveSequence(event.at, nowMs());
    const waitResult = await summaryBus.waitForSummary({
      binding: {
        source,
        runId,
        paneId: event.next.paneId,
        eventType: "pane.task_completed",
        sequence,
      },
      minSourceEventAt: event.at,
      waitMs: sourceConfig.waitMs,
    });

    if (waitResult.result === "hit") {
      return {
        result: "hit",
        reasonCode: "hit",
        waitedMs: waitResult.waitedMs,
        event: {
          eventId: waitResult.event.eventId,
          locator: waitResult.event.locator,
          summary: waitResult.event.summary,
        },
      };
    }
    if (waitResult.result === "rejected") {
      return {
        result: "rejected",
        reasonCode: "waiter_overflow",
        waitedMs: waitResult.waitedMs,
      };
    }
    return {
      result: "timeout",
      reasonCode: "timeout",
      waitedMs: waitResult.waitedMs,
    };
  };

  const resolveLocatorForTransition = (
    event: SessionTransitionEvent,
  ): SummaryPublishLocator | null => {
    const source = resolveSummarySource(event);
    if (!source) {
      return null;
    }
    return {
      source,
      runId: resolveRunId(event, source),
      paneId: event.next.paneId,
      eventType: "pane.task_completed",
      sequence: resolveSequence(event.at, nowMs()),
    };
  };

  return {
    resolveSummary,
    resolveLocatorForTransition,
  };
};
