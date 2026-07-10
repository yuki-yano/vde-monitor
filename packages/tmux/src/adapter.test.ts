import { describe, expect, it, vi } from "vitest";

import { TMUX_COMMAND_TIMEOUT_MS, createTmuxAdapter } from "./adapter";

vi.mock("execa", () => {
  return {
    execa: vi.fn(async () => ({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
    })),
  };
});

const getExeca = async () => {
  const mod = await import("execa");
  return mod.execa as unknown as ReturnType<typeof vi.fn>;
};

describe("createTmuxAdapter", () => {
  it("passes socket options to tmux", async () => {
    const adapter = createTmuxAdapter({ socketName: "tmux.sock", socketPath: "/tmp/tmux.sock" });
    const result = await adapter.run(["list-sessions"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith(
      "tmux",
      ["-L", "tmux.sock", "-S", "/tmp/tmux.sock", "list-sessions"],
      { reject: false, timeout: TMUX_COMMAND_TIMEOUT_MS },
    );
    expect(result).toEqual({ stdout: "ok", stderr: "", exitCode: 0 });
  });

  it("runs tmux without socket flags when not configured", async () => {
    const adapter = createTmuxAdapter();
    await adapter.run(["-V"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("tmux", ["-V"], {
      reject: false,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
    });
  });

  it("uses socketPath when socketName is missing", async () => {
    const adapter = createTmuxAdapter({ socketPath: "/tmp/tmux.sock" });
    await adapter.run(["list-panes"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("tmux", ["-S", "/tmp/tmux.sock", "list-panes"], {
      reject: false,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
    });
  });

  it("uses socketName when socketPath is missing", async () => {
    const adapter = createTmuxAdapter({ socketName: "tmux.sock" });
    await adapter.run(["list-windows"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("tmux", ["-L", "tmux.sock", "list-windows"], {
      reject: false,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
    });
  });

  it("normalizes missing exitCode to 0", async () => {
    const execa = await getExeca();
    execa.mockResolvedValueOnce({ stdout: "ok", stderr: "", exitCode: undefined });
    const adapter = createTmuxAdapter();
    const result = await adapter.run(["display-message"]);
    expect(result.exitCode).toBe(0);
  });

  it("normalizes command timeout to a non-zero adapter result", async () => {
    const execa = await getExeca();
    execa.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: undefined, timedOut: true });
    const adapter = createTmuxAdapter();

    await expect(adapter.run(["capture-pane"])).resolves.toEqual({
      stdout: "",
      stderr: "tmux command timed out",
      exitCode: 124,
    });
  });

  it("passes cancellation to the tmux subprocess", async () => {
    const controller = new AbortController();
    const adapter = createTmuxAdapter();

    await adapter.run(["capture-pane"], { signal: controller.signal });

    const execa = await getExeca();
    expect(execa).toHaveBeenLastCalledWith("tmux", ["capture-pane"], {
      reject: false,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
      cancelSignal: controller.signal,
    });
  });
});
