import type { NotificationSettings } from "@vde-monitor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationService } from "../../notifications/service";
import { createNotificationRoutes } from "./notification-routes";

const createServiceMock = (settingsOverride: Partial<NotificationSettings> = {}) => {
  const settings: NotificationSettings = {
    pushEnabled: true,
    vapidPublicKey: "vapid-test",
    supportedEvents: ["pane.waiting_permission", "pane.task_completed"],
    enabledEventTypes: ["pane.waiting_permission", "pane.task_completed"],
    requireStandaloneOnIOS: true,
    ...settingsOverride,
  };
  return {
    getSettings: vi.fn(() => settings),
    getSupportedEvents: vi.fn(() => settings.supportedEvents),
    validateSummaryLocator: vi.fn(() => ({ ok: true })),
    setSummarySessionDetailResolver: vi.fn(),
    publishSummaryEvent: vi.fn(() => ({
      ok: true,
      eventId: "evt-1",
      deduplicated: false,
    })),
    upsertSubscription: vi.fn(() => ({
      subscriptionId: "sub-1",
      created: true,
      savedAt: "2026-02-20T00:00:00.000Z",
    })),
    removeSubscription: vi.fn(() => true),
    revokeSubscriptions: vi.fn(() => 0),
    removeAllSubscriptions: vi.fn(() => 0),
    dispatchTransition: vi.fn(async () => undefined),
  } as unknown as NotificationService;
};

describe("createNotificationRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns settings", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/settings");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { settings: NotificationSettings };
    expect(data.settings.vapidPublicKey).toBe("vapid-test");
  });

  it("accepts summary publish events", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/summary-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        eventId: "evt-1",
        locator: {
          source: "claude",
          runId: "run-1",
          paneId: "%12",
          eventType: "pane.task_completed",
          sequence: 1,
        },
        sourceEventAt: "2026-03-02T00:00:00.000Z",
        summary: {
          paneTitle: "done",
          notificationTitle: "task done",
          notificationBody: "task completed",
        },
      }),
    });

    expect(res.status).toBe(202);
    expect(service.publishSummaryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-1",
      }),
    );
  });

  it("rejects summary publish when content-type is not json", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/summary-events", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("unsupported_content_type");
  });

  it("returns 429 when summary publish hits overflow", async () => {
    const service = createServiceMock();
    (service.publishSummaryEvent as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: false,
      code: "max_events_overflow",
      message: "overflow",
      eventId: "evt-1",
    });
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/summary-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        eventId: "evt-1",
        locator: {
          source: "claude",
          runId: "run-1",
          paneId: "%12",
          eventType: "pane.task_completed",
          sequence: 1,
        },
        sourceEventAt: "2026-03-02T00:00:00.000Z",
        summary: {
          paneTitle: "done",
          notificationTitle: "task done",
          notificationBody: "task completed",
        },
      }),
    });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { code: string; retryAfterSec: number };
    expect(body.code).toBe("max_events_overflow");
    expect(body.retryAfterSec).toBe(1);
  });

  it("returns 403 when summary locator validation fails", async () => {
    const service = createServiceMock();
    (service.validateSummaryLocator as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: false,
      status: 403,
      code: "forbidden_binding",
      message: "source mismatch",
    });
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/summary-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        eventId: "evt-1",
        locator: {
          source: "claude",
          runId: "run-1",
          paneId: "%12",
          eventType: "pane.task_completed",
          sequence: 1,
        },
        sourceEventAt: "2026-03-02T00:00:00.000Z",
        summary: {
          paneTitle: "done",
          notificationTitle: "task done",
          notificationBody: "task completed",
        },
      }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("forbidden_binding");
  });

  it("upserts subscription with normalized scope", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        subscription: {
          endpoint: "https://push.example/sub/1",
          expirationTime: null,
          keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
        },
        scope: {
          paneIds: ["%1", "%1"],
        },
        client: {
          platform: "ios",
          standalone: true,
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(service.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          paneIds: ["%1"],
          eventTypes: null,
        },
      }),
    );
  });

  it("accepts subscription payload without expirationTime", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        subscription: {
          endpoint: "https://push.example/sub/1",
          keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(service.upsertSubscription).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported event types for current supportedEvents", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        subscription: {
          endpoint: "https://push.example/sub/1",
          expirationTime: null,
          keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
        },
        scope: {
          eventTypes: ["pane.error"],
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns push disabled when global setting is off", async () => {
    const service = createServiceMock({ pushEnabled: false });
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        subscription: {
          endpoint: "https://push.example/sub/1",
          expirationTime: null,
          keys: { p256dh: "abc_DEF-123", auth: "xyz_DEF-456" },
        },
      }),
    });

    expect(res.status).toBe(409);
  });

  it("deletes subscription by id", async () => {
    const service = createServiceMock();
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions/sub-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(service.removeSubscription).toHaveBeenCalledWith("sub-1");
  });

  it("returns 404 when subscription does not exist", async () => {
    const service = createServiceMock();
    (service.removeSubscription as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions/missing", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });

  it("revoke route is not shadowed by :subscriptionId route", async () => {
    const service = createServiceMock();
    (service.revokeSubscriptions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1);
    const app = createNotificationRoutes({ notificationService: service });

    const res = await app.request("/notifications/subscriptions/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "device-1" }),
    });

    expect(res.status).toBe(200);
    expect(service.revokeSubscriptions).toHaveBeenCalledWith({ deviceId: "device-1" });
    expect(service.removeSubscription).not.toHaveBeenCalled();
  });
});
