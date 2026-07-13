import { describe, expect, it, vi } from "vitest";

import { WEZTERM_COMMAND_TIMEOUT_MS, createWeztermAdapter } from "./adapter";

vi.mock("execa", () => {
  return {
    execa: vi.fn(async () => ({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
    })),
  };
});

vi.mock("node:child_process", () => {
  const spawn = vi.fn(() => ({ pid: 1 }));
  return {
    default: { spawn },
    spawn,
  };
});

const getExeca = async () => {
  const mod = await import("execa");
  return mod.execa as unknown as ReturnType<typeof vi.fn>;
};

const getSpawn = async () => {
  const mod = await import("node:child_process");
  return mod.spawn as unknown as ReturnType<typeof vi.fn>;
};

describe("createWeztermAdapter", () => {
  it("runs wezterm cli without --target when target is auto", async () => {
    const adapter = createWeztermAdapter({ cliPath: "wezterm", target: "auto" });
    await adapter.run(["list", "--format", "json"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith("wezterm", ["cli", "list", "--format", "json"], {
      reject: false,
      timeout: WEZTERM_COMMAND_TIMEOUT_MS,
    });
  });

  it("adds --target for explicit target", async () => {
    const adapter = createWeztermAdapter({ cliPath: "/bin/wezterm", target: " dev " });
    await adapter.run(["list", "--format", "json"]);

    const execa = await getExeca();
    expect(execa).toHaveBeenCalledWith(
      "/bin/wezterm",
      ["cli", "--target", "dev", "list", "--format", "json"],
      { reject: false, timeout: WEZTERM_COMMAND_TIMEOUT_MS },
    );
  });

  it("normalizes missing exitCode to 0", async () => {
    const execa = await getExeca();
    execa.mockResolvedValueOnce({ stdout: "ok", stderr: "", exitCode: undefined });
    const adapter = createWeztermAdapter();
    const result = await adapter.run(["list", "--format", "json"]);
    expect(result.exitCode).toBe(0);
  });

  it("passes cancellation to the wezterm subprocess", async () => {
    const controller = new AbortController();
    const adapter = createWeztermAdapter();

    await adapter.run(["get-text"], { signal: controller.signal });

    const execa = await getExeca();
    expect(execa).toHaveBeenLastCalledWith("wezterm", ["cli", "get-text"], {
      reject: false,
      timeout: WEZTERM_COMMAND_TIMEOUT_MS,
      cancelSignal: controller.signal,
    });
  });

  it("normalizes a timed out process to exit code 124", async () => {
    const execa = await getExeca();
    execa.mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: undefined,
      timedOut: true,
    });
    const adapter = createWeztermAdapter();

    await expect(adapter.run(["list", "--format", "json"])).resolves.toEqual({
      stdout: "",
      stderr: "wezterm command timed out",
      exitCode: 124,
    });
  });

  it("normalizes a failed process without an exit code to a non-zero exit code", async () => {
    const execa = await getExeca();
    execa.mockResolvedValueOnce({
      stdout: "",
      stderr: "spawn failed",
      exitCode: null,
      timedOut: false,
      failed: true,
    });
    const adapter = createWeztermAdapter();

    await expect(adapter.run(["list", "--format", "json"])).resolves.toEqual({
      stdout: "",
      stderr: "spawn failed",
      exitCode: 1,
    });
  });

  it("spawns proxy with target args", async () => {
    const adapter = createWeztermAdapter({ cliPath: "wezterm", target: " dev " });
    adapter.spawnProxy?.();

    const spawn = await getSpawn();
    expect(spawn).toHaveBeenCalledWith("wezterm", ["cli", "--target", "dev", "proxy"], {
      stdio: "pipe",
    });
  });
});
