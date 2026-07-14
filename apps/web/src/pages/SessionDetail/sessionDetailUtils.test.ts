import { describe, expect, it } from "vitest";

import { resolveSessionFileRoot } from "./sessionDetailUtils";

describe("resolveSessionFileRoot", () => {
  it("uses the actual worktree path even when it is inside .git", () => {
    expect(
      resolveSessionFileRoot(
        {
          repoRoot: "/repo",
          worktreePath: "/repo/.git/worktrees/feature",
        },
        null,
      ),
    ).toBe("/repo/.git/worktrees/feature");
  });

  it("prefers a virtual worktree and otherwise falls back to the repository root", () => {
    const session = { repoRoot: "/repo", worktreePath: null };

    expect(resolveSessionFileRoot(session, "/repo/.worktree/feature")).toBe(
      "/repo/.worktree/feature",
    );
    expect(resolveSessionFileRoot(session, null)).toBe("/repo");
  });
});
