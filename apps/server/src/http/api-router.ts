import { zValidator } from "@hono/zod-validator";
import {
  type AgentMonitorConfig,
  allowedKeySchema,
  type RawItem,
  type SessionDetail,
} from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import { createCommandResponse } from "../command/command-response.js";
import { fetchCommitDetail, fetchCommitFile, fetchCommitLog } from "../git-commits.js";
import { fetchDiffFile, fetchDiffSummary } from "../git-diff.js";
import { createRateLimiter } from "../limits/rate-limit.js";
import type { createSessionMonitor } from "../monitor.js";
import { createScreenCache } from "../screen/screen-cache.js";
import { createScreenResponse } from "../screen/screen-response.js";
import type { createTmuxActions } from "../tmux-actions.js";
import { buildError, isOriginAllowed, nowIso, requireAuth } from "./helpers.js";

type Monitor = ReturnType<typeof createSessionMonitor>;
type TmuxActions = ReturnType<typeof createTmuxActions>;

type ApiContext = {
  config: AgentMonitorConfig;
  monitor: Monitor;
  tmuxActions: TmuxActions;
};

type RouteContext = {
  req: {
    param: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
};

type DiffSummaryResult = Awaited<ReturnType<typeof fetchDiffSummary>>;
type CommitLogResult = Awaited<ReturnType<typeof fetchCommitLog>>;

const forceQuerySchema = z.object({ force: z.string().optional() });
const diffFileQuerySchema = z.object({
  path: z.string(),
  rev: z.string().optional(),
  force: z.string().optional(),
});
const commitLogQuerySchema = z.object({
  limit: z.string().optional(),
  skip: z.string().optional(),
  force: z.string().optional(),
});
const commitDetailQuerySchema = z.object({ force: z.string().optional() });
const commitFileQuerySchema = z.object({
  path: z.string(),
  force: z.string().optional(),
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

export const createApiRouter = ({ config, monitor, tmuxActions }: ApiContext) => {
  const api = new Hono();
  const sendLimiter = createRateLimiter(config.rateLimit.send.windowMs, config.rateLimit.send.max);
  const screenLimiter = createRateLimiter(
    config.rateLimit.screen.windowMs,
    config.rateLimit.screen.max,
  );
  const rawLimiter = createRateLimiter(config.rateLimit.raw.windowMs, config.rateLimit.raw.max);
  const screenCache = createScreenCache();

  const getLimiterKey = (c: { req: { header: (name: string) => string | undefined } }) => {
    const auth = c.req.header("authorization") ?? c.req.header("Authorization");
    return auth ?? "rest";
  };

  const resolvePane = (c: RouteContext): { paneId: string; detail: SessionDetail } | Response => {
    const paneId = c.req.param("paneId");
    if (!paneId) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "invalid pane id") }, 400);
    }
    const detail = monitor.registry.getDetail(paneId);
    if (!detail) {
      return c.json({ error: buildError("INVALID_PANE", "pane not found") }, 404);
    }
    return { paneId, detail };
  };

  const ensureWritable = (c: RouteContext): Response | null => {
    if (!config.readOnly) {
      return null;
    }
    return c.json({ error: buildError("READ_ONLY", "read-only mode") }, 403);
  };

  const resolveWritablePane = (
    c: RouteContext,
  ): { paneId: string; detail: SessionDetail } | Response => {
    const readOnlyError = ensureWritable(c);
    if (readOnlyError) {
      return readOnlyError;
    }
    return resolvePane(c);
  };

  const resolveTitleUpdate = (c: RouteContext, title: string | null) => {
    const trimmed = title ? title.trim() : null;
    if (trimmed && trimmed.length > 80) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "title too long") }, 400);
    }
    return { nextTitle: trimmed && trimmed.length > 0 ? trimmed : null };
  };

  const resolveHash = (c: RouteContext): string | Response => {
    const hash = c.req.param("hash");
    if (!hash) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "missing hash") }, 400);
    }
    return hash;
  };

  const loadReadyDiffSummary = async (
    c: RouteContext,
    detail: SessionDetail,
    force: boolean,
  ): Promise<Response | { summary: DiffSummaryResult; repoRoot: string; rev: string }> => {
    const summary = await fetchDiffSummary(detail.currentPath, { force });
    if (!summary.repoRoot || summary.reason || !summary.rev) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "diff summary unavailable") }, 400);
    }
    return {
      summary,
      repoRoot: summary.repoRoot,
      rev: summary.rev,
    };
  };

  const loadReadyCommitLog = async (
    c: RouteContext,
    detail: SessionDetail,
  ): Promise<Response | { log: CommitLogResult; repoRoot: string }> => {
    const log = await fetchCommitLog(detail.currentPath, { limit: 1, skip: 0 });
    if (!log.repoRoot || log.reason) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "commit log unavailable") }, 400);
    }
    return {
      log,
      repoRoot: log.repoRoot,
    };
  };

  api.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const requestId = c.req.header("request-id") ?? c.req.header("x-request-id");
    if (requestId) {
      c.header("Request-Id", requestId);
    }
    if (!requireAuth(config, c)) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "unauthorized") }, 401);
    }
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    if (!isOriginAllowed(config, origin, host)) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "origin not allowed") }, 403);
    }
    await next();
  });

  const apiRoutes = api
    .get("/sessions", (c) => {
      return c.json({
        sessions: monitor.registry.snapshot(),
        serverTime: nowIso(),
        clientConfig: {
          screen: { highlightCorrection: config.screen.highlightCorrection },
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
    .put("/sessions/:paneId/title", zValidator("json", titleSchema), async (c) => {
      const pane = resolveWritablePane(c);
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
      const readOnlyError = ensureWritable(c);
      if (readOnlyError) {
        return readOnlyError;
      }
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      monitor.recordInput(pane.paneId);
      const updated = monitor.registry.getDetail(pane.paneId) ?? pane.detail;
      return c.json({ session: updated });
    })
    .post("/sessions/:paneId/screen", zValidator("json", screenRequestSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
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
      const command = await createCommandResponse({
        config,
        monitor,
        tmuxActions,
        payload: { type: "send.text", paneId: pane.paneId, text: body.text, enter: body.enter },
        limiterKey: getLimiterKey(c),
        sendLimiter,
        rawLimiter,
      });
      return c.json({ command });
    })
    .post("/sessions/:paneId/send/keys", zValidator("json", sendKeysSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      const command = await createCommandResponse({
        config,
        monitor,
        tmuxActions,
        payload: { type: "send.keys", paneId: pane.paneId, keys: body.keys },
        limiterKey: getLimiterKey(c),
        sendLimiter,
        rawLimiter,
      });
      return c.json({ command });
    })
    .post("/sessions/:paneId/send/raw", zValidator("json", sendRawSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      const command = await createCommandResponse({
        config,
        monitor,
        tmuxActions,
        payload: {
          type: "send.raw",
          paneId: pane.paneId,
          items: body.items as RawItem[],
          unsafe: body.unsafe,
        },
        limiterKey: getLimiterKey(c),
        sendLimiter,
        rawLimiter,
      });
      return c.json({ command });
    })
    .get("/sessions/:paneId/diff", zValidator("query", forceQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const query = c.req.valid("query");
      const force = query.force === "1";
      const summary = await fetchDiffSummary(pane.detail.currentPath, { force });
      return c.json({ summary });
    })
    .get("/sessions/:paneId/diff/file", zValidator("query", diffFileQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const query = c.req.valid("query");
      const pathParam = query.path;
      const force = query.force === "1";
      const readySummary = await loadReadyDiffSummary(c, pane.detail, force);
      if (readySummary instanceof Response) {
        return readySummary;
      }
      const target = readySummary.summary.files.find((file) => file.path === pathParam);
      if (!target) {
        return c.json({ error: buildError("NOT_FOUND", "file not found") }, 404);
      }
      const file = await fetchDiffFile(readySummary.repoRoot, target, readySummary.rev, { force });
      return c.json({ file });
    })
    .get("/sessions/:paneId/commits", zValidator("query", commitLogQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const query = c.req.valid("query");
      const limit = Number.parseInt(query.limit ?? "10", 10);
      const skip = Number.parseInt(query.skip ?? "0", 10);
      const force = query.force === "1";
      const log = await fetchCommitLog(pane.detail.currentPath, {
        limit: Number.isFinite(limit) ? limit : 10,
        skip: Number.isFinite(skip) ? skip : 0,
        force,
      });
      return c.json({ log });
    })
    .get(
      "/sessions/:paneId/commits/:hash",
      zValidator("query", commitDetailQuerySchema),
      async (c) => {
        const pane = resolvePane(c);
        if (pane instanceof Response) {
          return pane;
        }
        const hash = resolveHash(c);
        if (hash instanceof Response) {
          return hash;
        }
        const readyCommitLog = await loadReadyCommitLog(c, pane.detail);
        if (readyCommitLog instanceof Response) {
          return readyCommitLog;
        }
        const query = c.req.valid("query");
        const commit = await fetchCommitDetail(readyCommitLog.repoRoot, hash, {
          force: query.force === "1",
        });
        if (!commit) {
          return c.json({ error: buildError("NOT_FOUND", "commit not found") }, 404);
        }
        return c.json({ commit });
      },
    )
    .get(
      "/sessions/:paneId/commits/:hash/file",
      zValidator("query", commitFileQuerySchema),
      async (c) => {
        const pane = resolvePane(c);
        if (pane instanceof Response) {
          return pane;
        }
        const hash = resolveHash(c);
        if (hash instanceof Response) {
          return hash;
        }
        const query = c.req.valid("query");
        const pathParam = query.path;
        const readyCommitLog = await loadReadyCommitLog(c, pane.detail);
        if (readyCommitLog instanceof Response) {
          return readyCommitLog;
        }
        const commit = await fetchCommitDetail(readyCommitLog.repoRoot, hash, { force: true });
        if (!commit) {
          return c.json({ error: buildError("NOT_FOUND", "commit not found") }, 404);
        }
        const target =
          commit.files.find((file) => file.path === pathParam) ??
          commit.files.find((file) => file.renamedFrom === pathParam);
        if (!target) {
          return c.json({ error: buildError("NOT_FOUND", "file not found") }, 404);
        }
        const file = await fetchCommitFile(readyCommitLog.repoRoot, hash, target, {
          force: query.force === "1",
        });
        return c.json({ file });
      },
    );

  return apiRoutes;
};

export type ApiAppType = ReturnType<typeof createApiRouter>;
