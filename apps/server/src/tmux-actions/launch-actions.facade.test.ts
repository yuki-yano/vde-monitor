import {
  beforeEach,
  describe,
  execa,
  expect,
  it,
  resolveVwWorktreeSnapshotCached,
  vi,
} from "./test-helpers";
import { configDefaults } from "@vde-monitor/shared";

import { createTmuxActions } from "../tmux-actions.ts";

describe("createTmuxActions.launchAgentInSession", () => {
  beforeEach(() => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockReset();
    vi.mocked(execa).mockReset();
  });

  it("launches codex in a new detached window", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      windowName: "codex-work",
      cwd: "/tmp",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.windowId).toBe("@42");
    expect(result.result.paneId).toBe("%128");
    expect(result.result.verification.status).toBe("verified");
    expect(result.result.resolvedOptions).toEqual(["--model", "gpt-5-codex"]);
    expect(adapter.run).toHaveBeenCalledWith([
      "send-keys",
      "-l",
      "-t",
      "%128",
      "--",
      "codex --model gpt-5-codex",
    ]);
    expect(result.rollback).toEqual({ attempted: false, ok: true });
  });

  it("builds resume command with quoted cwd and session id", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      cwd: "/tmp",
      resumeSessionId: "sess-1",
    });

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith([
      "send-keys",
      "-l",
      "-t",
      "%128",
      "--",
      "cd '/tmp' && codex resume 'sess-1' --model gpt-5-codex",
    ]);
  });

  it("relaunches on the source pane when resumeFromPaneId is provided", async () => {
    let paneCommandQueryCount = 0;
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.includes("#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}")
        ) {
          return { stdout: "@7\t1\tmain\t%13\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.length >= 5 &&
          args[4] === "#{pane_current_command}"
        ) {
          paneCommandQueryCount += 1;
          return {
            stdout: paneCommandQueryCount === 1 ? "codex\n" : "zsh\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "display-message" && args.length >= 5 && args[4] === "#{pane_pid}") {
          return { stdout: "7777\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((() => true) as typeof process.kill);
    vi.mocked(execa).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "7777 1 -zsh\n8800 7777 codex\n",
      stderr: "",
    } as never);

    try {
      const result = await tmuxActions.launchAgentInSession({
        sessionName: "dev-main",
        agent: "codex",
        cwd: "/tmp",
        resumeSessionId: "sess-1",
        resumeFromPaneId: "%13",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.result.windowId).toBe("@7");
      expect(result.result.windowIndex).toBe(1);
      expect(result.result.windowName).toBe("main");
      expect(result.result.paneId).toBe("%13");
      expect(killSpy).toHaveBeenCalledWith(8800, "SIGTERM");
      expect(adapter.run).not.toHaveBeenCalledWith(["send-keys", "-t", "%13", "C-c"]);
      expect(adapter.run).toHaveBeenCalledWith([
        "send-keys",
        "-l",
        "-t",
        "%13",
        "--",
        "cd '/tmp' && codex resume 'sess-1' --model gpt-5-codex",
      ]);
      expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
    } finally {
      killSpy.mockRestore();
    }
  });

  it("stops source pane and launches codex in a new window when resumeTarget is window", async () => {
    let paneCommandQueryCount = 0;
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.includes("#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}")
        ) {
          return { stdout: "@7\t1\tmain\t%13\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.length >= 5 &&
          args[4] === "#{pane_current_path}"
        ) {
          return { stdout: "/repo/current\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.length >= 5 &&
          args[4] === "#{pane_current_command}"
        ) {
          paneCommandQueryCount += 1;
          return {
            stdout: paneCommandQueryCount === 1 ? "codex\n" : "zsh\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "display-message" && args.length >= 5 && args[4] === "#{pane_pid}") {
          return { stdout: "7777\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t2\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((() => true) as typeof process.kill);
    vi.mocked(execa).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "7777 1 -zsh\n8800 7777 codex\n",
      stderr: "",
    } as never);

    try {
      const result = await tmuxActions.launchAgentInSession({
        sessionName: "dev-main",
        agent: "codex",
        cwd: "/tmp",
        resumeSessionId: "sess-1",
        resumeFromPaneId: "%13",
        resumeTarget: "window",
      });

      expect(result.ok).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(8800, "SIGTERM");
      expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(true);
      const newWindowCall = adapter.run.mock.calls.find((call) => call[0]?.[0] === "new-window");
      expect(newWindowCall).toBeDefined();
      expect(newWindowCall?.[0]).toEqual(expect.arrayContaining(["-c", "/repo/current"]));
      expect(adapter.run).toHaveBeenCalledWith([
        "send-keys",
        "-l",
        "-t",
        "%128",
        "--",
        "cd '/tmp' && codex resume 'sess-1' --model gpt-5-codex",
      ]);
    } finally {
      killSpy.mockRestore();
    }
  });

  it("changes cwd before relaunch even when resume session id is unavailable", async () => {
    let paneCommandQueryCount = 0;
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.includes("#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}")
        ) {
          return { stdout: "@7\t1\tmain\t%13\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.length >= 5 &&
          args[4] === "#{pane_current_command}"
        ) {
          paneCommandQueryCount += 1;
          return {
            stdout: paneCommandQueryCount === 1 ? "codex\n" : "zsh\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "display-message" && args.length >= 5 && args[4] === "#{pane_pid}") {
          return { stdout: "7777\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((() => true) as typeof process.kill);
    vi.mocked(execa).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "7777 1 -zsh\n8800 7777 codex\n",
      stderr: "",
    } as never);

    try {
      const result = await tmuxActions.launchAgentInSession({
        sessionName: "dev-main",
        agent: "codex",
        cwd: "/tmp",
        resumeFromPaneId: "%13",
      });

      expect(result.ok).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(8800, "SIGTERM");
      expect(adapter.run).not.toHaveBeenCalledWith(["send-keys", "-t", "%13", "C-c"]);
      expect(adapter.run).toHaveBeenCalledWith([
        "send-keys",
        "-l",
        "-t",
        "%13",
        "--",
        "cd '/tmp' && codex --model gpt-5-codex",
      ]);
      expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
    } finally {
      killSpy.mockRestore();
    }
  });

  it("keeps claude running and sends !cd to move worktree on resume", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/tmp",
      baseBranch: "main",
      entries: [
        {
          path: "/tmp",
          branch: "feature/next",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
          pr: { status: "none" },
        },
      ],
    });
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/tmp\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.includes("#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}")
        ) {
          return { stdout: "@7\t1\tmain\t%13\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "claude\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((() => true) as typeof process.kill);

    try {
      const result = await tmuxActions.launchAgentInSession({
        sessionName: "dev-main",
        agent: "claude",
        worktreePath: "/tmp",
        resumeFromPaneId: "%13",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(killSpy).not.toHaveBeenCalled();
      expect(vi.mocked(execa)).not.toHaveBeenCalled();
      expect(adapter.run).toHaveBeenCalledWith([
        "send-keys",
        "-l",
        "-t",
        "%13",
        "--",
        "!cd '/tmp'",
      ]);
      expect(
        adapter.run.mock.calls.some(
          (call) => call[0]?.[0] === "display-message" && call[0]?.includes("#{pane_pid}"),
        ),
      ).toBe(false);
      expect(
        adapter.run.mock.calls.some(
          (call) =>
            call[0]?.[0] === "send-keys" &&
            call[0]?.[1] === "-l" &&
            typeof call[0]?.[5] === "string" &&
            call[0][5].includes("claude --resume"),
        ),
      ).toBe(false);
      expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
    } finally {
      killSpy.mockRestore();
    }
  });

  it("stops source pane and launches claude in a new window when resumeTarget is window", async () => {
    let paneCommandQueryCount = 0;
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.includes("#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}")
        ) {
          return { stdout: "@7\t1\tmain\t%13\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.length >= 5 &&
          args[4] === "#{pane_current_path}"
        ) {
          return { stdout: "/repo/current\n", stderr: "", exitCode: 0 };
        }
        if (
          args[0] === "display-message" &&
          args.length >= 5 &&
          args[4] === "#{pane_current_command}"
        ) {
          paneCommandQueryCount += 1;
          return {
            stdout: paneCommandQueryCount === 1 ? "claude\n" : "zsh\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "display-message" && args.length >= 5 && args[4] === "#{pane_pid}") {
          return { stdout: "7777\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t2\tclaude-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "claude\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: [] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((() => true) as typeof process.kill);
    vi.mocked(execa).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "7777 1 -zsh\n8801 7777 claude\n",
      stderr: "",
    } as never);

    try {
      const result = await tmuxActions.launchAgentInSession({
        sessionName: "dev-main",
        agent: "claude",
        cwd: "/tmp",
        resumeSessionId: "sess-1",
        resumeFromPaneId: "%13",
        resumeTarget: "window",
      });

      expect(result.ok).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(8801, "SIGTERM");
      expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(true);
      const newWindowCall = adapter.run.mock.calls.find((call) => call[0]?.[0] === "new-window");
      expect(newWindowCall).toBeDefined();
      expect(newWindowCall?.[0]).toEqual(expect.arrayContaining(["-c", "/repo/current"]));
      const launchCommandCall = adapter.run.mock.calls.find(
        (call) =>
          call[0]?.[0] === "send-keys" &&
          call[0]?.[1] === "-l" &&
          call[0]?.[3] === "%128" &&
          typeof call[0]?.[5] === "string",
      );
      expect(launchCommandCall).toBeDefined();
      const launchCommand = launchCommandCall?.[0]?.[5] as string;
      expect(launchCommand).toContain("claude --resume 'sess-1'");
      expect(launchCommand).toContain("!cd");
      expect(launchCommand.startsWith("cd '/tmp' &&")).toBe(false);
    } finally {
      killSpy.mockRestore();
    }
  });

  it("overrides configured launch options when agentOptions are provided", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      agentOptions: ["--approval-mode", "full-auto"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.resolvedOptions).toEqual(["--approval-mode", "full-auto"]);
    expect(adapter.run).toHaveBeenCalledWith([
      "send-keys",
      "-l",
      "-t",
      "%128",
      "--",
      "codex --approval-mode full-auto",
    ]);
  });

  it("rejects agentOptions containing tab characters", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      agentOptions: ["--model\tgpt-5"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(adapter.run).not.toHaveBeenCalled();
  });

  it("passes shell fragments in agentOptions without extra quoting", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...configDefaults,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      agentOptions: ['--message "hello world"', "--verbose"],
    });

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith([
      "send-keys",
      "-l",
      "-t",
      "%128",
      "--",
      'codex --message "hello world" --verbose',
    ]);
  });

  it("appends suffix when requested window name already exists", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return {
            stdout: "codex-work\ncodex-work-2\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t4\tcodex-work-3\t%129\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      windowName: "codex-work",
    });

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["new-window", "-d", "-P", "-F"]),
    );
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["-n", "codex-work-3", "-t", "dev-main"]),
    );
  });

  it("resolves launch cwd from vw worktreePath", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/tmp",
      baseBranch: "main",
      entries: [
        {
          path: "/tmp",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
          pr: { status: "none" },
        },
      ],
    });
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/tmp\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@55\t4\tcodex-work\t%155\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      worktreePath: "/tmp",
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(resolveVwWorktreeSnapshotCached)).toHaveBeenCalledWith("/tmp", {
      ghMode: "never",
    });
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["new-window", "-d", "-P", "-F"]),
    );
    expect(adapter.run).toHaveBeenCalledWith(expect.arrayContaining(["-c", "/tmp"]));
  });

  it("returns INVALID_PAYLOAD when vw snapshot is unavailable", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce(null);
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/repo\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreeBranch: "feature/a",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("vw worktree snapshot is unavailable");
    expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
  });

  it("creates a worktree via vw switch when worktreeCreateIfMissing is true", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/tmp",
      baseBranch: "main",
      entries: [
        {
          path: "/tmp/.worktree/feature/a",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
          pr: { status: "none" },
        },
      ],
    });
    vi.mocked(execa)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "main\n",
        stderr: "",
      } as never)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } as never)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/tmp\n",
        stderr: "",
      } as never);
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/tmp\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@51\t2\tclaude-work\t%151\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "claude\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreeBranch: "feature/new-pane",
      worktreeCreateIfMissing: true,
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      1,
      "vw",
      ["branch", "--show-current"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      2,
      "vw",
      ["switch", "feature/new-pane"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      3,
      "vw",
      ["path", "feature/new-pane"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["new-window", "-d", "-P", "-F"]),
    );
    expect(adapter.run).toHaveBeenCalledWith(expect.arrayContaining(["-c", "/tmp"]));
  });

  it("rolls back switched branch when vw path fails after worktree creation", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/tmp",
      baseBranch: "main",
      entries: [
        {
          path: "/tmp/.worktree/feature/a",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
          pr: { status: "none" },
        },
      ],
    });
    vi.mocked(execa)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "main\n",
        stderr: "",
      } as never)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } as never)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "path failed",
      } as never)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } as never);
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/tmp\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreeBranch: "feature/new-pane",
      worktreeCreateIfMissing: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("vw path failed: path failed");
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      1,
      "vw",
      ["branch", "--show-current"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      2,
      "vw",
      ["switch", "feature/new-pane"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      3,
      "vw",
      ["path", "feature/new-pane"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      4,
      "vw",
      ["switch", "main"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
  });

  it("returns INVALID_PAYLOAD when worktreePath and worktreeCreateIfMissing are combined", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreePath: "/repo/.worktree/feature/a",
      worktreeBranch: "feature/a",
      worktreeCreateIfMissing: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("worktreePath cannot be combined");
  });

  it("returns INVALID_PAYLOAD when worktreePath and worktreeBranch mismatch", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/repo",
      baseBranch: "main",
      entries: [
        {
          path: "/repo/.worktree/feature/a",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
          pr: { status: "none" },
        },
        {
          path: "/repo/.worktree/feature/b",
          branch: "feature/b",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
          pr: { status: "none" },
        },
      ],
    });
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/repo\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreePath: "/repo/.worktree/feature/a",
      worktreeBranch: "feature/b",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("resolved to different worktrees");
    expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
  });

  it("returns NOT_FOUND when session does not exist", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "missing", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "missing",
      agent: "claude",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.rollback).toEqual({ attempted: false, ok: true });
  });

  it("rolls back created window when send-keys fails", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t2\tclaude-work\t%130\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "send-keys" && args[1] === "-l") {
          return { stdout: "", stderr: "send failed", exitCode: 1 };
        }
        if (args[0] === "kill-window") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INTERNAL");
    expect(result.rollback).toEqual({ attempted: true, ok: true });
    expect(adapter.run).toHaveBeenCalledWith(["kill-window", "-t", "@42"]);
  });

  it("reports rollback failure details when kill-window fails", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t2\tclaude-work\t%130\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "send-keys" && args[1] === "-l") {
          return { stdout: "", stderr: "send failed", exitCode: 1 };
        }
        if (args[0] === "kill-window") {
          return { stdout: "", stderr: "kill failed", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.rollback.attempted).toBe(true);
    expect(result.rollback.ok).toBe(false);
    expect(result.rollback.message).toContain("kill failed");
  });

  it("returns mismatch verification when pane_current_command does not match", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tclaude-work\t%140\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "zsh\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.verification.status).toBe("mismatch");
    expect(result.result.verification.observedCommand).toBe("zsh");
    expect(result.result.verification.attempts).toBe(5);
  });
});
