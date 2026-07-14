import { describe, expect, it } from "vitest";

import { toClaudeCompletionItems } from "./claude-commands";

describe("toClaudeCompletionItems", () => {
  it("classifies scoped commands as Skills and preserves aliases", () => {
    expect(
      toClaudeCompletionItems([
        {
          name: "frontend-design",
          description: "Build intentional frontend designs. (user)",
          argumentHint: "[brief]",
          aliases: ["design"],
        },
      ]),
    ).toEqual([
      {
        id: "claude-skill:frontend-design",
        label: "/frontend-design",
        insertText: "/frontend-design",
        description: "Build intentional frontend designs.",
        argumentHint: "[brief]",
        kind: "skill",
        scope: "user",
      },
      {
        id: "claude-skill:design",
        label: "/design",
        insertText: "/design",
        description: "Build intentional frontend designs.",
        argumentHint: "[brief]",
        kind: "skill",
        scope: "user",
      },
    ]);
  });

  it("keeps built-in slash commands separate from Skills", () => {
    expect(
      toClaudeCompletionItems([
        { name: "compact", description: "Compact conversation history.", argumentHint: "" },
        { name: "simplify", description: "Simplify changed code.", argumentHint: "" },
      ]),
    ).toMatchObject([
      { label: "/compact", kind: "command", scope: "built-in" },
      { label: "/simplify", kind: "skill", scope: "bundled" },
    ]);
  });
});
