import { zValidator } from "@hono/zod-validator";
import {
  allowedKeySchema,
  type RawItem,
  type SessionStateTimelineRange,
  type SessionStateTimelineScope,
} from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import { createScreenResponse } from "../../screen/screen-response";
import { buildError, nowIso } from "../helpers";
import {
  IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES,
  ImageAttachmentError,
  saveImageAttachment,
} from "../image-attachment";
import { createSendTextIdempotencyExecutor } from "../send-text-idempotency";
import type { SessionRouteDeps } from "./types";

const timelineQuerySchema = z.object({
  scope: z.enum(["pane", "repo"]).optional(),
  range: z.enum(["15m", "1h", "3h", "6h", "24h"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
const titleSchema = z.object({
  title: z.string().nullable(),
});
const screenRequestSchema = z.object({
  mode: z.enum(["text", "image"]).optional(),
  lines: z.number().int().min(1).optional(),
  cursor: z.string().optional(),
});
const sendTextSchema = z.object({
  text: z.string(),
  enter: z.boolean().optional(),
  requestId: z.string().trim().min(1).max(128).optional(),
});
const sendKeysSchema = z.object({
  keys: z.array(allowedKeySchema),
});
const rawItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("key"), value: allowedKeySchema }),
]);
const sendRawSchema = z.object({
  items: z.array(rawItemSchema),
  unsafe: z.boolean().optional(),
});
const imageAttachmentFormSchema = z.object({
  image: z.instanceof(File).optional(),
});

const resolveTimelineRange = (range: string | undefined): SessionStateTimelineRange => {
  if (range === "15m" || range === "1h" || range === "3h" || range === "6h" || range === "24h") {
    return range;
  }
  return "1h";
};

const resolveTimelineScope = (scope: string | undefined): SessionStateTimelineScope => {
  if (scope === "repo") {
    return "repo";
  }
  return "pane";
};

export const createSessionRoutes = ({
  config,
  monitor,
  actions,
  screenLimiter,
  sendLimiter,
  screenCache,
  getLimiterKey,
  resolvePane,
  resolveTitleUpdate,
  validateAttachmentContentLength,
  executeCommand,
}: SessionRouteDeps) => {
  const sendTextIdempotency = createSendTextIdempotencyExecutor({});
  type ResolvedPane = Exclude<ReturnType<typeof resolvePane>, Response>;

  const withPane = <TReturn>(
    c: Parameters<typeof resolvePane>[0],
    handler: (pane: ResolvedPane) => TReturn,
  ): TReturn | Response => {
    const pane = resolvePane(c);
    if (pane instanceof Response) {
      return pane;
    }
    return handler(pane);
  };

  const resolveLatestSessionResponse = (pane: ResolvedPane) => ({
    session: monitor.registry.getDetail(pane.paneId) ?? pane.detail,
  });

  return new Hono()
    .get("/sessions", (c) => {
      return c.json({
        sessions: monitor.registry.snapshot(),
        serverTime: nowIso(),
        clientConfig: {
          screen: { highlightCorrection: config.screen.highlightCorrection },
          fileNavigator: {
            autoExpandMatchLimit: config.fileNavigator.autoExpandMatchLimit,
          },
        },
      });
    })
    .get("/sessions/:paneId", (c) => {
      return withPane(c, (pane) => c.json({ session: pane.detail }));
    })
    .get("/sessions/:paneId/timeline", zValidator("query", timelineQuerySchema), (c) => {
      return withPane(c, (pane) => {
        const query = c.req.valid("query");
        const range = resolveTimelineRange(query.range);
        const scope = resolveTimelineScope(query.scope);
        const limit = query.limit ?? 200;
        const timeline =
          scope === "repo"
            ? monitor.getRepoStateTimeline(pane.paneId, range, limit)
            : monitor.getStateTimeline(pane.paneId, range, limit);
        if (!timeline) {
          return c.json(
            { error: buildError("INVALID_PAYLOAD", "repo timeline is unavailable") },
            400,
          );
        }
        return c.json({ timeline });
      });
    })
    .put("/sessions/:paneId/title", zValidator("json", titleSchema), async (c) => {
      return withPane(c, (pane) => {
        const { title } = c.req.valid("json");
        const titleUpdate = resolveTitleUpdate(c, title);
        if (titleUpdate instanceof Response) {
          return titleUpdate;
        }
        monitor.setCustomTitle(pane.paneId, titleUpdate.nextTitle);
        return c.json(resolveLatestSessionResponse(pane));
      });
    })
    .post("/sessions/:paneId/touch", (c) => {
      return withPane(c, (pane) => {
        monitor.recordInput(pane.paneId);
        return c.json(resolveLatestSessionResponse(pane));
      });
    })
    .post(
      "/sessions/:paneId/attachments/image",
      zValidator("form", imageAttachmentFormSchema),
      async (c) => {
        return withPane(c, async (pane) => {
          const contentLength = validateAttachmentContentLength(c);
          if (contentLength instanceof Response) {
            return contentLength;
          }
          if (contentLength > IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES) {
            return c.json(
              { error: buildError("INVALID_PAYLOAD", "attachment exceeds content-length limit") },
              400,
            );
          }
          const { image } = c.req.valid("form");
          if (!(image instanceof File)) {
            return c.json({ error: buildError("INVALID_PAYLOAD", "image field is required") }, 400);
          }

          try {
            const attachment = await saveImageAttachment({
              paneId: pane.paneId,
              repoRoot: pane.detail.repoRoot,
              file: image,
            });
            return c.json({ attachment });
          } catch (error) {
            if (error instanceof ImageAttachmentError) {
              return c.json({ error: buildError(error.code, error.message) }, error.status);
            }
            return c.json(
              { error: buildError("INTERNAL", "failed to save image attachment") },
              500,
            );
          }
        });
      },
    )
    .post("/sessions/:paneId/screen", zValidator("json", screenRequestSchema), async (c) => {
      return withPane(c, async (pane) => {
        monitor.markPaneViewed(pane.paneId);
        const body = c.req.valid("json");
        const screen = await createScreenResponse({
          config,
          monitor,
          target: pane.detail,
          mode: body.mode,
          lines: body.lines,
          cursor: body.cursor,
          screenLimiter,
          limiterKey: getLimiterKey(c),
          buildTextResponse: screenCache.buildTextResponse,
        });
        return c.json({ screen });
      });
    })
    .post("/sessions/:paneId/send/text", zValidator("json", sendTextSchema), async (c) => {
      return withPane(c, async (pane) => {
        const body = c.req.valid("json");
        const command = await sendTextIdempotency.execute({
          paneId: pane.paneId,
          text: body.text,
          enter: body.enter,
          requestId: body.requestId,
          executeSendText: ({ paneId, text, enter }) =>
            executeCommand(c, {
              type: "send.text",
              paneId,
              text,
              enter,
            }),
        });
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/send/keys", zValidator("json", sendKeysSchema), async (c) => {
      return withPane(c, async (pane) => {
        const body = c.req.valid("json");
        const command = await executeCommand(c, {
          type: "send.keys",
          paneId: pane.paneId,
          keys: body.keys,
        });
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/send/raw", zValidator("json", sendRawSchema), async (c) => {
      return withPane(c, async (pane) => {
        const body = c.req.valid("json");
        const command = await executeCommand(c, {
          type: "send.raw",
          paneId: pane.paneId,
          items: body.items as RawItem[],
          unsafe: body.unsafe,
        });
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/focus", async (c) => {
      return withPane(c, async (pane) => {
        if (!sendLimiter(getLimiterKey(c))) {
          return c.json({
            command: {
              ok: false,
              error: buildError("RATE_LIMIT", "rate limited"),
            },
          });
        }
        const command = await actions.focusPane(pane.paneId);
        return c.json({ command });
      });
    });
};
