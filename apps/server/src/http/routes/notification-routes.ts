import { zValidator } from "@hono/zod-validator";
import {
  dedupeStrings,
  notificationSubscriptionRevokeSchema,
  notificationSubscriptionUpsertSchema,
  type PushEventType,
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
