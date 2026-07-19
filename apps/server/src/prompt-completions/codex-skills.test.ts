import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { listCodexSkills } from "./codex-skills";

const fakeAppServer = String.raw`
const readline = require("node:readline");
const reader = readline.createInterface({ input: process.stdin });
reader.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\n");
  }
  if (message.method === "skills/list") {
    process.stdout.write(JSON.stringify({
      id: message.id,
      result: {
        data: [{
          cwd: message.params.cwds[0],
          skills: [
            { name: "react-doctor", description: "Run diagnostics.", path: "/user/react-doctor/SKILL.md", scope: "user", enabled: true },
            { name: "duplicate", description: "User copy.", path: "/user/duplicate/SKILL.md", scope: "user", enabled: true },
            { name: "duplicate", description: "Repo copy.", path: "/repo/duplicate/SKILL.md", scope: "repo", enabled: true },
            { name: "visualize:visualize", description: "Create visualizations.", path: "/user/.codex/plugins/cache/visualize/SKILL.md", scope: "user", enabled: true },
            { name: "disabled", description: "Disabled Skill.", path: "/user/disabled/SKILL.md", scope: "user", enabled: false }
          ],
          errors: []
        }]
      }
    }) + "\n");
  }
});
`;

describe("listCodexSkills", () => {
  it("loads enabled Skills from the Codex App Server and disables ambiguous names", async () => {
    const spawnAppServer = vi.fn(() =>
      spawn(process.execPath, ["-e", fakeAppServer], { stdio: ["pipe", "pipe", "pipe"] }),
    );

    const items = await listCodexSkills({ cwd: "/repo", port: { spawnAppServer } });

    expect(spawnAppServer).toHaveBeenCalledWith("/repo");
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      id: "codex-skill:/user/react-doctor/SKILL.md",
      label: "$react-doctor",
      insertText: "$react-doctor",
      description: "Run diagnostics.",
      argumentHint: "",
      kind: "skill",
      scope: "user",
    });
    expect(items.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "$duplicate",
          disabledReason: "Multiple Skills use this name, so it cannot be selected here.",
        }),
      ]),
    );
    expect(items).toContainEqual({
      id: "codex-skill:/user/.codex/plugins/cache/visualize/SKILL.md",
      label: "$visualize:visualize",
      insertText: "$visualize:visualize",
      description: "Create visualizations.",
      argumentHint: "",
      kind: "skill",
      scope: "user",
    });
    expect(items.some((item) => item.label === "$disabled")).toBe(false);
  });
});
