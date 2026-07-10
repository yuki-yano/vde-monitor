import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";

import {
  buildProcessSnapshotIndexes,
  createAgentProcessSnapshot,
  findAgentFromPidTree,
  getAgentFromTty,
  getProcessCommand,
  parseProcessSnapshotLine,
} from "./agent-resolver-process";

const execaMock = vi.mocked(execa);

beforeEach(() => {
  execaMock.mockReset();
});

describe("agent-resolver-process", () => {
  it("parses the unified pid, ppid, tty, and command format", () => {
    expect(parseProcessSnapshotLine(" 100  10 ttys001  node /opt/codex ")).toEqual({
      pid: 100,
      ppid: 10,
      tty: "ttys001",
      command: "node /opt/codex",
    });
    expect(parseProcessSnapshotLine("101 10 ?? launchd")).toEqual({
      pid: 101,
      ppid: 10,
      tty: null,
      command: "launchd",
    });
    expect(parseProcessSnapshotLine("malformed line")).toBeNull();
  });

  it("builds pid, child, and tty indexes while skipping malformed lines", () => {
    const indexes = buildProcessSnapshotIndexes(
      ["100 1 ttys001 zsh", "200 100 ttys001 codex", "bad", "300 1 ?? daemon"].join("\n"),
    );

    expect(indexes.processByPid.get(200)?.command).toBe("codex");
    expect(indexes.childrenByParentPid.get(100)).toEqual([200]);
    expect(indexes.processesByTty.get("ttys001")?.map(({ pid }) => pid)).toEqual([100, 200]);
    expect(indexes.processByPid.has(300)).toBe(true);
  });

  it("runs exactly one unified ps command for a successful snapshot", async () => {
    execaMock.mockResolvedValueOnce({
      stdout: "100 1 ttys001 zsh\n200 100 ttys001 codex\n",
      stderr: "",
      exitCode: 0,
    } as never);

    const snapshot = await createAgentProcessSnapshot();

    expect(snapshot.status).toBe("success");
    expect(execaMock).toHaveBeenCalledOnce();
    expect(execaMock).toHaveBeenCalledWith("ps", ["-ax", "-o", "pid=,ppid=,tty=,command="], {
      reject: false,
      timeout: 2000,
    });
  });

  it("returns failed without reusing an older snapshot on non-zero or thrown command", async () => {
    execaMock
      .mockResolvedValueOnce({ stdout: "", stderr: "denied", exitCode: 1 } as never)
      .mockRejectedValueOnce(new Error("timeout"));

    await expect(createAgentProcessSnapshot()).resolves.toEqual({
      status: "failed",
      error: "denied",
    });
    await expect(createAgentProcessSnapshot()).resolves.toEqual({
      status: "failed",
      error: "timeout",
    });
  });

  it("resolves direct pid, descendant, and tty agents from one snapshot", () => {
    const snapshot = {
      status: "success" as const,
      ...buildProcessSnapshotIndexes(
        [
          "100 1 ttys001 zsh",
          "200 100 ttys001 node /opt/codex",
          "300 1 ttys002 /usr/bin/claude",
        ].join("\n"),
      ),
    };

    expect(getProcessCommand(snapshot, 100)).toBe("zsh");
    expect(findAgentFromPidTree(snapshot, 100)).toBe("codex");
    expect(getAgentFromTty(snapshot, "/dev/ttys002")).toBe("claude");
  });
});
