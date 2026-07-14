import { describe, expect, it } from "vitest";

import { extractCodexContextLeft, resolveSessionFileRoot } from "./sessionDetailUtils";

describe("extractCodexContextLeft", () => {
  it("keeps extracting the latest 'Context % left' label", () => {
    const input = "Context 91% left\n\u001b[32mContext 74% left\u001b[0m";

    expect(extractCodexContextLeft(input)).toBe("Context 74% left");
  });

  it("ignores plain '% left' labels", () => {
    const input =
      "❯ prompt 78% left | model info\nstatusline: cpu=9% mem=63% context | tokens 43% left | mode";

    expect(extractCodexContextLeft(input)).toBeNull();
  });

  it("prefers the latest 'Context % left' match over a later plain '% left' label", () => {
    const input = "Context 81% left\nstatus 49% left";

    expect(extractCodexContextLeft(input)).toBe("Context 81% left");
  });

  it("returns null when no context-left style label exists", () => {
    expect(extractCodexContextLeft("no context label here")).toBeNull();
  });
});

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
