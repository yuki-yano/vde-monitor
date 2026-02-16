import { zValidator } from "@hono/zod-validator";
import {
  allowedKeySchema,
  launchAgentRequestSchema,
  type LaunchCommandResponse,
  type RawItem,
  type SessionStateTimelineRange,
  type SessionStateTimelineScope,
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
import { createSendTextIdempotencyExecutor } from "../send-text-idempotency";
import type { SessionRouteDeps } from "./types";
import { resolveWorktreeListPayload } from "./worktree-utils";

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
const notePayloadSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  body: z.string().max(10_000),
});
const imageAttachmentFormSchema = z.object({
  image: z.instanceof(File).optional(),
});
const launchRequestSchema = launchAgentRequestSchema;
const LAUNCH_IDEMPOTENCY_TTL_MS = 60_000;
const LAUNCH_IDEMPOTENCY_MAX_ENTRIES = 500;

type LaunchIdempotencyPayload = {
  agent: z.infer<typeof launchRequestSchema>["agent"];
  windowName: string | null;
  cwd: string | null;
  agentOptions: string[] | null;
  worktreePath: string | null;
  worktreeBranch: string | null;
  worktreeCreateIfMissing: boolean;
};

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

const normalizeNoteTitle = (title: string | null | undefined) => {
  if (title == null) {
    return null;
  }
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const launchIdempotency = new Map<
    string,
    {
      expiresAtMs: number;
      payloadFingerprint: string;
      settled: boolean;
      wasSuccessful: boolean;
      promise: Promise<LaunchCommandResponse>;
    }
  >();
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

  const pruneLaunchIdempotency = () => {
    const nowMs = Date.now();
    for (const [key, value] of launchIdempotency.entries()) {
      if (value.expiresAtMs <= nowMs) {
        launchIdempotency.delete(key);
      }
    }
  };

  const launchResponseWithRollback = (
    errorCode: "INVALID_PAYLOAD" | "RATE_LIMIT" | "INTERNAL",
    message: string,
  ): LaunchCommandResponse => ({
    ok: false,
    error: buildError(errorCode, message),
    rollback: { attempted: false, ok: true },
  });

  const toLaunchIdempotencyPayload = (
    body: z.infer<typeof launchRequestSchema>,
  ): LaunchIdempotencyPayload => ({
    agent: body.agent,
    windowName: body.windowName ?? null,
    cwd: body.cwd ?? null,
    agentOptions: body.agentOptions ?? null,
    worktreePath: body.worktreePath ?? null,
    worktreeBranch: body.worktreeBranch ?? null,
    worktreeCreateIfMissing: body.worktreeCreateIfMissing === true,
  });

  const executeLaunchAgentCommand = async (
    body: z.infer<typeof launchRequestSchema>,
    limiterKey: string,
  ): Promise<LaunchCommandResponse> => {
    pruneLaunchIdempotency();
    const cacheKey = `${body.sessionName}:${body.requestId}`;
    const payloadFingerprint = JSON.stringify(toLaunchIdempotencyPayload(body));
    const nowMs = Date.now();
    const cached = launchIdempotency.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
      if (cached.payloadFingerprint !== payloadFingerprint) {
        return launchResponseWithRollback("INVALID_PAYLOAD", "requestId payload mismatch");
      }
      if (!cached.settled || cached.wasSuccessful) {
        return cached.promise;
      }
      launchIdempotency.delete(cacheKey);
    } else if (cached) {
      launchIdempotency.delete(cacheKey);
    }

    if (!sendLimiter(limiterKey)) {
      return launchResponseWithRollback("RATE_LIMIT", "rate limited");
    }

    const entry: {
      expiresAtMs: number;
      payloadFingerprint: string;
      settled: boolean;
      wasSuccessful: boolean;
      promise: Promise<LaunchCommandResponse>;
    } = {
      expiresAtMs: nowMs + LAUNCH_IDEMPOTENCY_TTL_MS,
      payloadFingerprint,
      settled: false,
      wasSuccessful: false,
      promise: actions
        .launchAgentInSession({
          sessionName: body.sessionName,
          agent: body.agent,
          windowName: body.windowName,
          cwd: body.cwd,
          agentOptions: body.agentOptions,
          worktreePath: body.worktreePath,
          worktreeBranch: body.worktreeBranch,
          worktreeCreateIfMissing: body.worktreeCreateIfMissing,
        })
        .then((response) => {
          entry.settled = true;
          entry.wasSuccessful = response.ok;
          if (!response.ok) {
            launchIdempotency.delete(cacheKey);
          }
          return response;
        })
        .catch((error) => {
          launchIdempotency.delete(cacheKey);
          if (error instanceof Error && error.message.trim().length > 0) {
            return launchResponseWithRollback("INTERNAL", error.message);
          }
          return launchResponseWithRollback("INTERNAL", "launch command failed");
        }),
    };

    setMapEntryWithLimit(launchIdempotency, cacheKey, entry, LAUNCH_IDEMPOTENCY_MAX_ENTRIES);
    return entry.promise;
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
          launch: config.launch,
        },
      });
    })
    .post("/sessions/launch", zValidator("json", launchRequestSchema), async (c) => {
      const body = c.req.valid("json");
      const command = await executeLaunchAgentCommand(body, getLimiterKey(c));
      return c.json({ command });
    })
    .get("/sessions/:paneId", (c) => {
      return withPane(c, (pane) => c.json({ session: pane.detail }));
    })
    .get("/sessions/:paneId/worktrees", async (c) => {
      return withPane(c, async (pane) => {
        const worktrees = await resolveWorktreeListPayload(pane.detail);
        return c.json({ worktrees });
      });
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
    .get("/sessions/:paneId/notes", (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const notes = monitor.getRepoNotes(pane.paneId) ?? [];
        return c.json({ repoRoot: pane.detail.repoRoot, notes });
      });
    })
    .post("/sessions/:paneId/notes", zValidator("json", notePayloadSchema), (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const payload = c.req.valid("json");
        const note = monitor.createRepoNote(pane.paneId, {
          title: normalizeNoteTitle(payload.title),
          body: payload.body,
        });
        if (!note) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        return c.json({ note });
      });
    })
    .put("/sessions/:paneId/notes/:noteId", zValidator("json", notePayloadSchema), (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const noteId = c.req.param("noteId")?.trim();
        if (!noteId) {
          return c.json({ error: buildError("INVALID_PAYLOAD", "invalid note id") }, 400);
        }
        const payload = c.req.valid("json");
        const note = monitor.updateRepoNote(pane.paneId, noteId, {
          title: normalizeNoteTitle(payload.title),
          body: payload.body,
        });
        if (!note) {
          return c.json({ error: buildError("NOT_FOUND", "note not found") }, 404);
        }
        return c.json({ note });
      });
    })
    .delete("/sessions/:paneId/notes/:noteId", (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const noteId = c.req.param("noteId")?.trim();
        if (!noteId) {
          return c.json({ error: buildError("INVALID_PAYLOAD", "invalid note id") }, 400);
        }
        const removed = monitor.deleteRepoNote(pane.paneId, noteId);
        if (!removed) {
          return c.json({ error: buildError("NOT_FOUND", "note not found") }, 404);
        }
        return c.json({ noteId });
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
    .post("/sessions/:paneId/kill/pane", async (c) => {
      return withPane(c, async (pane) => {
        if (!sendLimiter(getLimiterKey(c))) {
          return c.json({
            command: {
              ok: false,
              error: buildError("RATE_LIMIT", "rate limited"),
            },
          });
        }
        const command = await actions.killPane(pane.paneId);
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/kill/window", async (c) => {
      return withPane(c, async (pane) => {
        if (!sendLimiter(getLimiterKey(c))) {
          return c.json({
            command: {
              ok: false,
              error: buildError("RATE_LIMIT", "rate limited"),
            },
          });
        }
        const command = await actions.killWindow(pane.paneId);
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
