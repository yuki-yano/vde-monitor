import { describe, expect, it, vi } from "vitest";

import { createTmuxAdapter } from "./adapter";

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
      { reject: false },
    );
    expect(result).toEqual({ stdout: "ok", stderr: "", exitCode: 0 });
  });

  it("runs tmux without socket flags when not configured", async () => {
    const adapter = createTmuxAdapter();
    await adapter.run(["-V"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("tmux", ["-V"], { reject: false });
  });

  it("uses socketPath when socketName is missing", async () => {
    const adapter = createTmuxAdapter({ socketPath: "/tmp/tmux.sock" });
    await adapter.run(["list-panes"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("tmux", ["-S", "/tmp/tmux.sock", "list-panes"], {
      reject: false,
    });
  });

  it("uses socketName when socketPath is missing", async () => {
    const adapter = createTmuxAdapter({ socketName: "tmux.sock" });
    await adapter.run(["list-windows"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("tmux", ["-L", "tmux.sock", "list-windows"], {
      reject: false,
    });
  });

  it("normalizes missing exitCode to 0", async () => {
    const execa = await getExeca();
    execa.mockResolvedValueOnce({ stdout: "ok", stderr: "", exitCode: undefined });
    const adapter = createTmuxAdapter();
    const result = await adapter.run(["display-message"]);
    expect(result.exitCode).toBe(0);
  });
});
