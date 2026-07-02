import { buildError } from "../helpers";
import { resolveRequestedWorktreePath } from "./worktree-utils";

export const resolveRequestedPath = async (
  c: {
    json: (body: unknown, status?: number) => Response;
  },
  detail: { repoRoot: string | null; currentPath: string | null },
  worktreePath: string | undefined,
  fallbackPath: string | null,
): Promise<Response | string | null> => {
  const resolved = await resolveRequestedWorktreePath({
    detail,
    worktreePath,
    fallbackPath,
  });
  if (!resolved.ok) {
    if (resolved.reason === "worktree_override_unavailable") {
      return c.json(
        { error: buildError("INVALID_PAYLOAD", "worktree override is unavailable") },
        400,
      );
    }
    return c.json({ error: buildError("INVALID_PAYLOAD", "invalid worktree path") }, 400);
  }
  return resolved.path;
};
