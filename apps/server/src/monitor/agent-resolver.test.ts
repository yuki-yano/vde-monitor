import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";

import { resolvePaneAgent } from "./agent-resolver";
import {
  type AgentProcessSnapshot,
  buildProcessSnapshotIndexes,
  createAgentProcessSnapshot,
} from "./agent-resolver-process";

const execaMock = vi.mocked(execa);

const buildPane = (
  overrides: Partial<{
    currentCommand: string | null;
    paneStartCommand: string | null;
    paneTitle: string | null;
    panePid: number | null;
    paneTty: string | null;
  }>,
) => ({
  currentCommand: null,
  paneStartCommand: null,
  paneTitle: null,
  panePid: 100,
  paneTty: "tty1",
  ...overrides,
});

const successSnapshot = (stdout: string): AgentProcessSnapshot => ({
  status: "success",
  ...buildProcessSnapshotIndexes(stdout),
});

const failedSnapshot: AgentProcessSnapshot = { status: "failed", error: "ps failed" };

beforeEach(() => {
  execaMock.mockReset();
});

describe("resolvePaneAgent", () => {
  it("preserves the 42 pane baseline resolution with one ps command per tick", async () => {
    const roots = Array.from(
      { length: 42 },
      (_, index) =>
        `${1000 + index} 1 ttys${index.toString().padStart(3, "0")} ${
          index >= 3 && index <= 5 ? ["claude", "codex", "claude"][index - 3] : "zsh"
        }`,
    );
    execaMock.mockResolvedValueOnce({
      stdout: [
        ...roots,
        "2006 1006 ttys006 codex",
        "2007 1007 ttys007 claude",
        "2008 1008 ttys008 codex",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    } as never);
    const snapshot = await createAgentProcessSnapshot();
    const panes = Array.from({ length: 42 }, (_, index) =>
      buildPane({
        currentCommand: index === 0 ? "codex" : index === 1 ? "claude" : "zsh",
        paneStartCommand: index === 2 ? "codex" : null,
        panePid: 1000 + index,
        paneTty: `ttys${index.toString().padStart(3, "0")}`,
      }),
    );

    const results = await Promise.all(panes.map((pane) => resolvePaneAgent(pane, snapshot)));

    expect(results.filter(({ agent }) => agent === "codex")).toHaveLength(5);
    expect(results.filter(({ agent }) => agent === "claude")).toHaveLength(4);
    expect(results.filter(({ agent }) => agent === "unknown")).toHaveLength(33);
    expect(results.filter(({ presence }) => presence === "present")).toHaveLength(9);
    expect(results.filter(({ presence }) => presence === "absent")).toHaveLength(33);
    expect(execaMock).toHaveBeenCalledOnce();
  });

  it("ignores editor panes with an agent argument", async () => {
    const result = await resolvePaneAgent(
      buildPane({ currentCommand: "vim", paneStartCommand: "vim -c codex" }),
      failedSnapshot,
    );
    expect(result).toEqual({ agent: "unknown", ignore: true, presence: "absent" });
  });

  it("ignores editor panes when the pane process command has an agent argument", async () => {
    const result = await resolvePaneAgent(
      buildPane({ currentCommand: "vim", paneStartCommand: "vim" }),
      successSnapshot("100 1 tty1 vim --cmd codex"),
    );
    expect(result).toEqual({ agent: "unknown", ignore: true, presence: "absent" });
  });

  it("detects an agent from metadata even when the snapshot failed", async () => {
    const result = await resolvePaneAgent(buildPane({ currentCommand: "codex" }), failedSnapshot);
    expect(result).toEqual({ agent: "codex", ignore: false, presence: "present" });
  });

  it("resolves agents from direct process, pid tree, and tty indexes", async () => {
    const snapshot = successSnapshot(
      [
        "100 1 tty1 claude",
        "200 1 tty2 zsh",
        "201 200 tty2 codex",
        "300 1 tty3 zsh",
        "301 1 tty3 claude",
      ].join("\n"),
    );

    await expect(
      resolvePaneAgent(buildPane({ currentCommand: "zsh", panePid: 100 }), snapshot),
    ).resolves.toMatchObject({ agent: "claude", presence: "present" });
    await expect(
      resolvePaneAgent(buildPane({ currentCommand: "zsh", panePid: 200 }), snapshot),
    ).resolves.toMatchObject({ agent: "codex", presence: "present" });
    await expect(
      resolvePaneAgent(
        buildPane({ currentCommand: "zsh", panePid: 999, paneTty: "/dev/tty3" }),
        snapshot,
      ),
    ).resolves.toMatchObject({ agent: "claude", presence: "present" });
  });

  it("returns absent only from a successful snapshot", async () => {
    await expect(
      resolvePaneAgent(buildPane({ currentCommand: "zsh" }), successSnapshot("100 1 tty1 zsh")),
    ).resolves.toMatchObject({ agent: "unknown", presence: "absent" });
    await expect(
      resolvePaneAgent(buildPane({ currentCommand: "zsh" }), failedSnapshot),
    ).resolves.toMatchObject({ agent: "unknown", presence: "indeterminate" });
    await expect(
      resolvePaneAgent(buildPane({ currentCommand: "zsh" }), null),
    ).resolves.toMatchObject({ agent: "unknown", presence: "indeterminate" });
  });

  it("does not infer an agent or editor ignore from pane title only", async () => {
    await expect(
      resolvePaneAgent(
        buildPane({
          currentCommand: null,
          paneStartCommand: null,
          paneTitle: "✳ Claude Code",
        }),
        successSnapshot("100 1 tty1 zsh"),
      ),
    ).resolves.toMatchObject({ agent: "unknown", ignore: false });
    await expect(
      resolvePaneAgent(
        buildPane({
          currentCommand: "vim",
          paneStartCommand: "vim",
          paneTitle: "✳ Claude Code",
        }),
        successSnapshot("100 1 tty1 vim"),
      ),
    ).resolves.toMatchObject({ agent: "unknown", ignore: false });
  });
});
