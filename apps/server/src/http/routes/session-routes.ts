import { zValidator } from "@hono/zod-validator";
import {
  allowedKeySchema,
  type CommandResponse,
  type RawItem,
  type SessionStateTimelineRange,
} from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import { setMapEntryWithLimit } from "../../cache";
import { createScreenResponse } from "../../screen/screen-response";
import { buildError, nowIso } from "../helpers";
import {
  IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES,
  ImageAttachmentError,
  saveImageAttachment,
} from "../image-attachment";
import type { SessionRouteDeps } from "./types";

const timelineQuerySchema = z.object({
  range: z.enum(["15m", "1h", "6h"]).optional(),
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
  if (range === "15m" || range === "1h" || range === "6h") {
    return range;
  }
  return "1h";
};

const SEND_TEXT_IDEMPOTENCY_TTL_MS = 60_000;
const SEND_TEXT_IDEMPOTENCY_MAX_ENTRIES = 1000;

type SendTextCacheEntry = {
  paneId: string;
  text: string;
  enter: boolean;
  expiresAtMs: number;
  promise: Promise<CommandResponse>;
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
  const sendTextCache = new Map<string, SendTextCacheEntry>();

  const pruneSendTextCache = () => {
    const nowMs = Date.now();
    for (const [cacheKey, cached] of sendTextCache.entries()) {
      if (cached.expiresAtMs <= nowMs) {
        sendTextCache.delete(cacheKey);
      }
    }
  };

  const executeSendTextCommand = ({
    c,
    paneId,
    text,
    enter,
    requestId,
  }: {
    c: {
      req: { header: (name: string) => string | undefined };
    };
    paneId: string;
    text: string;
    enter?: boolean;
    requestId?: string;
  }): Promise<CommandResponse> => {
    const normalizedEnter = enter ?? true;
    if (!requestId) {
      return executeCommand(c, {
        type: "send.text",
        paneId,
        text,
        enter: normalizedEnter,
      });
    }

    pruneSendTextCache();
    const cacheKey = `${paneId}:${requestId}`;
    const nowMs = Date.now();
    const cached = sendTextCache.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
      if (cached.text !== text || cached.enter !== normalizedEnter) {
        return Promise.resolve({
          ok: false,
          error: buildError("INVALID_PAYLOAD", "requestId payload mismatch"),
        });
      }
      return cached.promise;
    }
    if (cached) {
      sendTextCache.delete(cacheKey);
    }

    const promise = executeCommand(c, {
      type: "send.text",
      paneId,
      text,
      enter: normalizedEnter,
    }).catch((error) => {
      sendTextCache.delete(cacheKey);
      throw error;
    });
    setMapEntryWithLimit(
      sendTextCache,
      cacheKey,
      {
        paneId,
        text,
        enter: normalizedEnter,
        expiresAtMs: nowMs + SEND_TEXT_IDEMPOTENCY_TTL_MS,
        promise,
      },
      SEND_TEXT_IDEMPOTENCY_MAX_ENTRIES,
    );
    return promise;
  };

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
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      return c.json({ session: pane.detail });
    })
    .get("/sessions/:paneId/timeline", zValidator("query", timelineQuerySchema), (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const query = c.req.valid("query");
      const timeline = monitor.getStateTimeline(
        pane.paneId,
        resolveTimelineRange(query.range),
        query.limit ?? 200,
      );
      return c.json({ timeline });
    })
    .put("/sessions/:paneId/title", zValidator("json", titleSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const { title } = c.req.valid("json");
      const titleUpdate = resolveTitleUpdate(c, title);
      if (titleUpdate instanceof Response) {
        return titleUpdate;
      }
      monitor.setCustomTitle(pane.paneId, titleUpdate.nextTitle);
      const updated = monitor.registry.getDetail(pane.paneId) ?? pane.detail;
      return c.json({ session: updated });
    })
    .post("/sessions/:paneId/touch", (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      monitor.recordInput(pane.paneId);
      const updated = monitor.registry.getDetail(pane.paneId) ?? pane.detail;
      return c.json({ session: updated });
    })
    .post(
      "/sessions/:paneId/attachments/image",
      zValidator("form", imageAttachmentFormSchema),
      async (c) => {
        const pane = resolvePane(c);
        if (pane instanceof Response) {
          return pane;
        }
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
          return c.json({ error: buildError("INTERNAL", "failed to save image attachment") }, 500);
        }
      },
    )
    .post("/sessions/:paneId/screen", zValidator("json", screenRequestSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
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
    })
    .post("/sessions/:paneId/send/text", zValidator("json", sendTextSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      const command = await executeSendTextCommand({
        c,
        paneId: pane.paneId,
        text: body.text,
        enter: body.enter,
        requestId: body.requestId,
      });
      return c.json({ command });
    })
    .post("/sessions/:paneId/send/keys", zValidator("json", sendKeysSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      const command = await executeCommand(c, {
        type: "send.keys",
        paneId: pane.paneId,
        keys: body.keys,
      });
      return c.json({ command });
    })
    .post("/sessions/:paneId/send/raw", zValidator("json", sendRawSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      const command = await executeCommand(c, {
        type: "send.raw",
        paneId: pane.paneId,
        items: body.items as RawItem[],
        unsafe: body.unsafe,
      });
      return c.json({ command });
    })
    .post("/sessions/:paneId/focus", async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
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
};
