import type {
  AgentMonitorConfig,
  MultiplexerInputActions,
  MultiplexerLaunchCapability,
} from "@vde-monitor/multiplexer";
import {
  type NotificationSettings,
  type RepoNote,
  type SessionDetail,
  type UsageProviderSnapshot,
  configDefaults,
} from "@vde-monitor/shared";
import { vi } from "vitest";

import type { UsageDashboardService } from "../domain/usage-dashboard/usage-dashboard-service";
import type { createSessionMonitor } from "../monitor";
import type { NotificationService } from "../notifications/service";
import { createSessionRegistry } from "../session-registry";
import type { ScreenStreamScheduler } from "../streams/screen-stream-scheduler";
import type { SessionsStreamSource } from "../streams/sessions-stream-source";
import type { StreamConnections } from "../streams/stream-connections";
import { createApiRouter } from "./api-router";

type Monitor = ReturnType<typeof createSessionMonitor>;

const createSessionDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "pane-1",
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/tmp",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "codex",
  state: "RUNNING",
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
  completion: null,
  ...overrides,
});

const buildUsageProviderSnapshot = (
  providerId: "codex" | "claude",
  overrides: Partial<UsageProviderSnapshot> = {},
): UsageProviderSnapshot => ({
  providerId,
  providerLabel: providerId === "codex" ? "Codex" : "Claude",
  accountLabel: null,
  planLabel: null,
  windows: [
    {
      id: "session",
      title: "Session",
      utilizationPercent: 10,
      windowDurationMs: 300 * 60 * 1000,
      resetsAt: "2026-02-22T18:00:00.000Z",
      pace: {
        elapsedPercent: 20,
        projectedEndUtilizationPercent: 50,
        paceMarginPercent: 50,
        status: "margin",
      },
    },
    {
      id: "weekly",
      title: "Weekly",
      utilizationPercent: 55,
      windowDurationMs: 10_080 * 60 * 1000,
      resetsAt: "2026-02-24T10:00:00.000Z",
      pace: {
        elapsedPercent: 70,
        projectedEndUtilizationPercent: 78,
        paceMarginPercent: 22,
        status: "margin",
      },
    },
  ],
  billing: {
    creditsLeft: null,
    creditsUnit: null,
    extraUsageUsedUsd: null,
    extraUsageLimitUsd: null,
    costTodayUsd: null,
    costTodayTokens: null,
    costLast30DaysUsd: null,
    costLast30DaysTokens: null,
    meta: {
      source: "unavailable",
      sourceLabel: null,
      confidence: null,
      updatedAt: null,
      reasonCode: null,
      reasonMessage: null,
    },
    modelBreakdown: [],
    dailyBreakdown: [],
  },
  capabilities: {
    session: true,
    weekly: true,
    pace: true,
    modelWindows: false,
    credits: false,
    extraUsage: false,
    cost: false,
  },
  status: "ok",
  issues: [],
  fetchedAt: "2026-02-22T10:00:00.000Z",
  staleAt: "2026-02-22T10:03:00.000Z",
  ...overrides,
});

/**
 * Creates minimal no-op mock stream deps for tests that do not exercise SSE routes.
 */
export const createTestStreamDeps = () => {
  const streamSource = {
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => ({
      id: 0,
      event: { type: "snapshot", serverTime: "2026-01-01T00:00:00.000Z", sessions: [] },
    })),
    replaySince: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as SessionsStreamSource;

  const screenScheduler = {
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn(),
  } as unknown as ScreenStreamScheduler;

  const streamConnections = {
    add: vi.fn(() => () => {}),
    closeAll: vi.fn(),
  } as unknown as StreamConnections;

  return { streamSource, screenScheduler, streamConnections };
};

export const createTestContext = (configOverrides: Partial<AgentMonitorConfig> = {}) => {
  const config: AgentMonitorConfig = { ...configDefaults, token: "token", ...configOverrides };
  const registry = createSessionRegistry();
  const detail = createSessionDetail();
  registry.update(detail);
  const captureText = vi.fn(async () => ({
    screen: "hello",
    alternateOn: false,
    truncated: null,
  }));
  const getStateTimeline = vi.fn(() => ({
    paneId: detail.paneId,
    now: new Date(0).toISOString(),
    range: "1h",
    items: [],
    totalsMs: {
      RUNNING: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  }));
  const getRepoStateTimeline = vi.fn(() => ({
    paneId: detail.paneId,
    now: new Date(0).toISOString(),
    range: "1h",
    items: [],
    totalsMs: {
      RUNNING: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  }));
  const getGlobalStateTimeline = vi.fn(() => ({
    paneId: "global",
    now: new Date(0).toISOString(),
    range: "7d",
    items: [],
    totalsMs: {
      RUNNING: 0,
      WAITING_INPUT: 0,
      WAITING_PERMISSION: 0,
      SHELL: 0,
      UNKNOWN: 0,
    },
    current: null,
  }));
  const getRepoNotes = vi.fn((): RepoNote[] => []);
  const createRepoNote = vi.fn((_: string, input: { title?: string | null; body: string }) => ({
    id: "note-1",
    repoRoot: detail.repoRoot ?? "/repo",
    title: input.title ?? null,
    body: input.body,
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
  }));
  const updateRepoNote = vi.fn(
    (
      _: string,
      noteId: string,
      input: { title?: string | null; body: string },
    ): RepoNote | null => ({
      id: noteId,
      repoRoot: detail.repoRoot ?? "/repo",
      title: input.title ?? null,
      body: input.body,
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:01.000Z",
    }),
  );
  const deleteRepoNote = vi.fn(() => true);
  const acknowledgeView = vi.fn(
    ({ paneId }: { paneId: string; epoch: string; throughSeq: number }) =>
      registry.getDetail(paneId),
  );
  const monitor = {
    registry,
    getScreenCapture: () => ({ captureText }),
    getStateTimeline,
    getRepoStateTimeline,
    getGlobalStateTimeline,
    getRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
    setCustomTitle: vi.fn((paneId: string, title: string | null) => {
      const existing = registry.getDetail(paneId);
      if (!existing) return;
      registry.update({ ...existing, customTitle: title });
    }),
    recordInput: vi.fn(),
    markPaneObservationDirty: vi.fn(),
    acknowledgeView,
    markPaneViewed: vi.fn(),
  } as unknown as Monitor;
  const actions = {
    sendText: vi.fn(async () => ({ ok: true })),
    sendKeys: vi.fn(async () => ({ ok: true })),
    sendRaw: vi.fn(async () => ({ ok: true })),
    clearPaneTitle: vi.fn(async () => ({ ok: true as const })),
    focusPane: vi.fn(async () => ({ ok: true as const })),
    killPane: vi.fn(async () => ({ ok: true as const })),
    killWindow: vi.fn(async () => ({ ok: true as const })),
  } as unknown as MultiplexerInputActions;
  const launchCapability: MultiplexerLaunchCapability = {
    launchAgentInSession: vi.fn(async () => ({
      ok: true as const,
      result: {
        sessionName: "session",
        agent: "codex" as const,
        windowId: "@42",
        windowIndex: 1,
        windowName: "codex-work",
        paneId: "%99",
        launchedCommand: "codex" as const,
        resolvedOptions: [],
        verification: {
          status: "verified" as const,
          observedCommand: "codex",
          attempts: 1,
        },
      },
      rollback: { attempted: false, ok: true },
    })),
  };
  const settings: NotificationSettings = {
    pushEnabled: true,
    vapidPublicKey: "test-vapid",
    supportedEvents: ["pane.waiting_permission", "pane.task_completed"],
    enabledEventTypes: ["pane.waiting_permission", "pane.task_completed"],
    requireStandaloneOnIOS: true,
  };
  const notificationService = {
    getSettings: vi.fn(() => settings),
    upsertSubscription: vi.fn(() => ({
      subscriptionId: "sub-1",
      created: true,
      savedAt: "2026-02-20T00:00:00.000Z",
    })),
    removeSubscription: vi.fn(() => true),
    revokeSubscriptions: vi.fn(() => 0),
    removeAllSubscriptions: vi.fn(() => 0),
    dispatchTransition: vi.fn(async () => undefined),
    getSupportedEvents: vi.fn(() => ["pane.waiting_permission", "pane.task_completed"]),
  } as unknown as NotificationService;
  const codexProviderSnapshot = buildUsageProviderSnapshot("codex");
  const claudeProviderSnapshot = buildUsageProviderSnapshot("claude");
  const getDashboard = vi.fn(async () => ({
    providers: [codexProviderSnapshot, claudeProviderSnapshot],
    fetchedAt: "2026-02-22T10:00:00.000Z",
  }));
  const getProviderSnapshot = vi.fn(async (providerId: "codex" | "claude") =>
    providerId === "codex" ? codexProviderSnapshot : claudeProviderSnapshot,
  );
  const usageDashboardService = {
    getDashboard,
    getProviderSnapshot,
  } as unknown as UsageDashboardService;
  const streamDeps = createTestStreamDeps();
  const api = createApiRouter({
    config,
    monitor,
    actions,
    launchCapability: config.multiplexer.backend === "tmux" ? launchCapability : undefined,
    notificationService,
    usageDashboardService,
    ...streamDeps,
  });
  return {
    api,
    config,
    monitor,
    actions,
    launchCapability,
    notificationService,
    detail,
    getStateTimeline,
    getRepoStateTimeline,
    getGlobalStateTimeline,
    getRepoNotes,
    createRepoNote,
    updateRepoNote,
    deleteRepoNote,
    acknowledgeView,
    getDashboard,
    getProviderSnapshot,
    ...streamDeps,
  };
};

export const authHeaders = {
  Authorization: "Bearer token",
};

export const createMultipartImagePayload = ({
  fieldName = "image",
  fileName = "sample.png",
  mimeType = "image/png",
  content = "png-data",
  boundary = "----vde-monitor-test-boundary",
}: {
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  content?: string;
  boundary?: string;
} = {}) => {
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return {
    body,
    boundary,
    byteLength: Buffer.byteLength(body),
  };
};
