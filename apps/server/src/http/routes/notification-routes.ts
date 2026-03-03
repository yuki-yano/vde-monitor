import { zValidator } from "@hono/zod-validator";
import {
  type PushEventType,
  dedupeStrings,
  notificationSubscriptionRevokeSchema,
  notificationSubscriptionUpsertSchema,
  summaryPublishRequestSchema,
} from "@vde-monitor/shared";
import { Hono } from "hono";

import type { NotificationService } from "../../notifications/service";
import { buildError } from "../helpers";

type NotificationRouteDeps = {
  notificationService: NotificationService;
};

const normalizeEventTypes = ({
  input,
  supportedEventTypes,
}: {
  input: PushEventType[] | null | undefined;
  supportedEventTypes: Set<string>;
}) => {
  if (input == null) {
    return { ok: true as const, eventTypes: null as PushEventType[] | null };
  }
  if (input.length === 0) {
    return {
      ok: false as const,
      message: "scope.eventTypes must contain at least one event type",
    };
  }
  const deduped = dedupeStrings(input);
  const unsupported = deduped.filter((eventType) => !supportedEventTypes.has(eventType));
  if (unsupported.length > 0) {
    return {
      ok: false as const,
      message: `unsupported event types: ${unsupported.join(", ")}`,
    };
  }
  return { ok: true as const, eventTypes: deduped };
};

export const createNotificationRoutes = ({ notificationService }: NotificationRouteDeps) => {
  const app = new Hono();

  app.post("/notifications/summary-events", async (c) => {
    const contentType = c.req.header("content-type") ?? c.req.header("Content-Type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return c.json(
        {
          schemaVersion: 1,
          code: "unsupported_content_type",
          message: "content-type must be application/json",
        },
        400,
      );
    }

    let parsedBody: unknown;
    try {
      parsedBody = await c.req.json();
    } catch {
      return c.json(
        {
          schemaVersion: 1,
          code: "invalid_json",
          message: "request body is not valid json",
        },
        400,
      );
    }

    const validated = summaryPublishRequestSchema.safeParse(parsedBody);
    if (!validated.success) {
      const input = validated.error.issues[0]?.path[0];
      const body = parsedBody as { schemaVersion?: unknown } | null;
      if (
        (input === "schemaVersion" || typeof body?.schemaVersion !== "undefined") &&
        body?.schemaVersion !== 1
      ) {
        return c.json(
          {
            schemaVersion: 1,
            code: "unsupported_schema_version",
            message: "unsupported schemaVersion",
          },
          400,
        );
      }
      const eventId =
        parsedBody != null &&
        typeof parsedBody === "object" &&
        !Array.isArray(parsedBody) &&
        typeof (parsedBody as { eventId?: unknown }).eventId === "string"
          ? ((parsedBody as { eventId?: string }).eventId ?? undefined)
          : undefined;
      return c.json(
        {
          schemaVersion: 1,
          code: "invalid_request",
          message: "invalid summary publish request",
          ...(eventId ? { eventId } : {}),
        },
        400,
      );
    }

    const locatorValidation = notificationService.validateSummaryLocator(validated.data.locator);
    if (!locatorValidation.ok) {
      return c.json(
        {
          schemaVersion: 1,
          code: locatorValidation.code,
          message: locatorValidation.message,
          eventId: validated.data.eventId,
        },
        locatorValidation.status,
      );
    }

    const publishResult = notificationService.publishSummaryEvent(validated.data);
    if (!publishResult.ok) {
      if (publishResult.code === "max_events_overflow") {
        return c.json(
          {
            schemaVersion: 1,
            code: "max_events_overflow",
            message: publishResult.message,
            ...(publishResult.eventId ? { eventId: publishResult.eventId } : {}),
            retryAfterSec: 1,
          },
          429,
        );
      }
      return c.json(
        {
          schemaVersion: 1,
          code: "invalid_request",
          message: publishResult.message,
          ...(publishResult.eventId ? { eventId: publishResult.eventId } : {}),
        },
        400,
      );
    }

    return c.json(
      {
        schemaVersion: 1,
        eventId: publishResult.eventId,
        deduplicated: publishResult.deduplicated,
      },
      202,
    );
  });

  app.get("/notifications/settings", (c) => {
    return c.json({
      settings: notificationService.getSettings(),
    });
  });

  app.post(
    "/notifications/subscriptions",
    zValidator("json", notificationSubscriptionUpsertSchema),
    (c) => {
      const payload = c.req.valid("json");
      const settings = notificationService.getSettings();
      if (!settings.pushEnabled) {
        return c.json(
          {
            error: buildError("PUSH_DISABLED", "push notifications are disabled"),
          },
          409,
        );
      }

      const normalizedPaneIds = dedupeStrings(payload.scope?.paneIds ?? []);
      const normalizedEventTypes = normalizeEventTypes({
        input: payload.scope?.eventTypes,
        supportedEventTypes: new Set(notificationService.getSupportedEvents()),
      });
      if (!normalizedEventTypes.ok) {
        return c.json(
          {
            error: buildError("INVALID_PAYLOAD", normalizedEventTypes.message),
          },
          400,
        );
      }

      try {
        const result = notificationService.upsertSubscription({
          deviceId: payload.deviceId,
          subscription: payload.subscription,
          scope: {
            paneIds: normalizedPaneIds,
            eventTypes: normalizedEventTypes.eventTypes,
          },
          client: payload.client,
        });
        return c.json(result);
      } catch (error) {
        if (error instanceof Error && error.message === "PUSH_DISABLED") {
          return c.json(
            {
              error: buildError("PUSH_DISABLED", "push notifications are disabled"),
            },
            409,
          );
        }
        return c.json(
          {
            error: buildError("INTERNAL", "failed to upsert notification subscription"),
          },
          500,
        );
      }
    },
  );

  app.post(
    "/notifications/subscriptions/revoke",
    zValidator("json", notificationSubscriptionRevokeSchema),
    (c) => {
      const payload = c.req.valid("json");
      const removedCount = notificationService.revokeSubscriptions(payload);
      return c.json({ removedCount });
    },
  );

  app.delete("/notifications/subscriptions/:subscriptionId", (c) => {
    const subscriptionId = c.req.param("subscriptionId");
    if (!subscriptionId) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "missing subscription id") }, 400);
    }
    const removed = notificationService.removeSubscription(subscriptionId);
    if (!removed) {
      return c.json({ error: buildError("NOT_FOUND", "subscription not found") }, 404);
    }
    return c.json({ subscriptionId });
  });

  return app;
};
