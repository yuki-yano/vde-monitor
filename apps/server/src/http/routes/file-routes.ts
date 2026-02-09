import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { createRepoFileService, type RepoFileServiceError } from "../../repo-files/service";
import { buildError } from "../helpers";
import type { FileRouteDeps } from "./types";

const treeQuerySchema = z.object({
  path: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

const searchQuerySchema = z.object({
  q: z.string(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

const contentQuerySchema = z.object({
  path: z.string(),
  maxBytes: z.string().optional(),
});

const SEARCH_QUERY_MAX_LENGTH = 4096;

const parseLimit = ({
  rawLimit,
  fallback,
  min,
  max,
}: {
  rawLimit: string | undefined;
  fallback: number;
  min: number;
  max: number;
}) => {
  if (!rawLimit) {
    return fallback;
  }
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
};

const isRepoFileServiceError = (error: unknown): error is RepoFileServiceError => {
  if (typeof error !== "object" || error == null) {
    return false;
  }
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.message === "string"
  );
};

const resolveRepoRoot = (repoRoot: string | null): string | null => {
  if (!repoRoot || repoRoot.trim().length === 0) {
    return null;
  }
  return repoRoot;
};

const mapServiceError = (error: RepoFileServiceError) => {
  return {
    error: buildError(error.code, error.message),
    status: error.status,
  };
};

export const createFileRoutes = ({ resolvePane, config }: FileRouteDeps) => {
  const repoFileService = createRepoFileService({
    fileNavigatorConfig: config.fileNavigator,
  });

  return new Hono()
    .get("/sessions/:paneId/files/tree", zValidator("query", treeQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const repoRoot = resolveRepoRoot(pane.detail.repoRoot);
      if (!repoRoot) {
        return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
      }

      const query = c.req.valid("query");
      const limit = parseLimit({
        rawLimit: query.limit,
        fallback: 100,
        min: 1,
        max: 200,
      });
      if (limit == null) {
        return c.json({ error: buildError("INVALID_PAYLOAD", "invalid limit") }, 400);
      }

      try {
        const tree = await repoFileService.listTree({
          repoRoot,
          path: query.path,
          cursor: query.cursor,
          limit,
        });
        return c.json({ tree });
      } catch (error) {
        if (isRepoFileServiceError(error)) {
          const mapped = mapServiceError(error);
          return c.json({ error: mapped.error }, mapped.status);
        }
        return c.json({ error: buildError("INTERNAL", "failed to load file tree") }, 500);
      }
    })
    .get("/sessions/:paneId/files/search", zValidator("query", searchQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const repoRoot = resolveRepoRoot(pane.detail.repoRoot);
      if (!repoRoot) {
        return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
      }

      const query = c.req.valid("query");
      const limit = parseLimit({
        rawLimit: query.limit,
        fallback: 50,
        min: 1,
        max: 100,
      });
      if (limit == null) {
        return c.json({ error: buildError("INVALID_PAYLOAD", "invalid limit") }, 400);
      }
      const normalizedQuery = query.q.trim();
      if (normalizedQuery.length < 1 || normalizedQuery.length > SEARCH_QUERY_MAX_LENGTH) {
        return c.json({ error: buildError("INVALID_PAYLOAD", "invalid query") }, 400);
      }

      try {
        const result = await repoFileService.searchFiles({
          repoRoot,
          query: normalizedQuery,
          cursor: query.cursor,
          limit,
        });
        return c.json({ result });
      } catch (error) {
        if (isRepoFileServiceError(error)) {
          const mapped = mapServiceError(error);
          return c.json({ error: mapped.error }, mapped.status);
        }
        return c.json({ error: buildError("INTERNAL", "failed to search files") }, 500);
      }
    })
    .get("/sessions/:paneId/files/content", zValidator("query", contentQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const repoRoot = resolveRepoRoot(pane.detail.repoRoot);
      if (!repoRoot) {
        return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
      }

      const query = c.req.valid("query");
      const limit = parseLimit({
        rawLimit: query.maxBytes,
        fallback: 256 * 1024,
        min: 1,
        max: 1024 * 1024,
      });
      if (limit == null) {
        return c.json({ error: buildError("INVALID_PAYLOAD", "invalid maxBytes") }, 400);
      }
      if (query.path.trim().length === 0) {
        return c.json({ error: buildError("INVALID_PAYLOAD", "path is required") }, 400);
      }

      try {
        const file = await repoFileService.getFileContent({
          repoRoot,
          path: query.path,
          maxBytes: limit,
        });
        return c.json({ file });
      } catch (error) {
        if (isRepoFileServiceError(error)) {
          const mapped = mapServiceError(error);
          return c.json({ error: mapped.error }, mapped.status);
        }
        return c.json({ error: buildError("INTERNAL", "failed to load file content") }, 500);
      }
    });
};
