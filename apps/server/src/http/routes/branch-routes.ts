import { zValidator } from "@hono/zod-validator";
import type { SessionDetail } from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import { clearBranchDiffCachesForRepo } from "../../domain/git/git-branch-diff";
import {
  GitCommandError,
  checkoutBranch,
  clearBranchListCache,
  createBranch,
  deleteBranch,
  fetchBranchList,
} from "../../domain/git/git-branches";
import { clearDiffCachesForRepo } from "../../domain/git/git-diff";
import { resolveRepoRoot } from "../../domain/git/git-utils";
import { clearRepoBranchCache } from "../../monitor/repo-branch";
import { clearVwWorktreeSnapshotCache } from "../../monitor/vw-worktree";
import { buildError } from "../helpers";
import type { GitRouteDeps, RouteContext } from "./types";

const branchNameSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("-"), { message: "invalid branch name" });

const branchesQuerySchema = z.object({ force: z.string().optional() });
const checkoutJsonSchema = z.object({ branch: branchNameSchema });
const createJsonSchema = z.object({
  name: branchNameSchema,
  base: branchNameSchema.optional(),
});
const deleteJsonSchema = z.object({
  name: branchNameSchema,
  force: z.boolean().optional(),
});

const resolveSessionCwd = (detail: SessionDetail): string | null =>
  detail.currentPath ?? detail.repoRoot;

const invalidateBranchCaches = async (cwd: string) => {
  const repoRoot = await resolveRepoRoot(cwd);
  if (repoRoot) {
    clearBranchListCache(repoRoot);
    clearDiffCachesForRepo(repoRoot);
    clearBranchDiffCachesForRepo(repoRoot);
  }
  clearRepoBranchCache(cwd);
  clearVwWorktreeSnapshotCache(cwd);
  if (repoRoot) {
    clearRepoBranchCache(repoRoot);
    clearVwWorktreeSnapshotCache(repoRoot);
  }
};

const runBranchMutation = async (
  c: RouteContext,
  cwd: string | null,
  mutate: (cwd: string) => Promise<void>,
): Promise<Response> => {
  if (!cwd) {
    return c.json({ error: buildError("REPO_UNAVAILABLE", "session cwd is unavailable") }, 400);
  }
  try {
    await mutate(cwd);
  } catch (err) {
    if (err instanceof GitCommandError) {
      return c.json({ error: buildError("GIT_COMMAND_FAILED", err.message) }, 400);
    }
    throw err;
  }
  await invalidateBranchCaches(cwd);
  return c.json({ ok: true });
};

export const createBranchRoutes = ({ resolvePane }: GitRouteDeps) =>
  new Hono()
    .get("/sessions/:paneId/branches", zValidator("query", branchesQuerySchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const query = c.req.valid("query");
      const branches = await fetchBranchList(resolveSessionCwd(pane.detail), {
        force: query.force === "1",
      });
      return c.json({ branches });
    })
    .post(
      "/sessions/:paneId/branches/checkout",
      zValidator("json", checkoutJsonSchema),
      async (c) => {
        const pane = resolvePane(c);
        if (pane instanceof Response) {
          return pane;
        }
        const body = c.req.valid("json");
        return runBranchMutation(c, resolveSessionCwd(pane.detail), (cwd) =>
          checkoutBranch(cwd, body.branch),
        );
      },
    )
    .post("/sessions/:paneId/branches", zValidator("json", createJsonSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      return runBranchMutation(c, resolveSessionCwd(pane.detail), (cwd) =>
        createBranch(cwd, body.name, body.base),
      );
    })
    .post("/sessions/:paneId/branches/delete", zValidator("json", deleteJsonSchema), async (c) => {
      const pane = resolvePane(c);
      if (pane instanceof Response) {
        return pane;
      }
      const body = c.req.valid("json");
      return runBranchMutation(c, resolveSessionCwd(pane.detail), (cwd) =>
        deleteBranch(cwd, body.name, { force: body.force }),
      );
    });
