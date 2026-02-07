import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: mocks.execa,
}));

import { focusTmuxPane, getPaneGeometry } from "./tmux-geometry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("focusTmuxPane", () => {
  it("does nothing when pane id is empty", async () => {
    await focusTmuxPane("");

    expect(mocks.execa).not.toHaveBeenCalled();
  });

  it("focuses primary client, session, window and pane in order", async () => {
    mocks.execa
      .mockResolvedValueOnce({ stdout: "" })
      .mockResolvedValueOnce({ stdout: "dev-session\n" })
      .mockResolvedValueOnce({ stdout: "" })
      .mockResolvedValueOnce({ stdout: "" })
      .mockResolvedValueOnce({ stdout: "" });

    await focusTmuxPane("%1", {
      socketName: "sock",
      socketPath: "/tmp/tmux.sock",
      primaryClient: "client-1",
    });

    expect(mocks.execa).toHaveBeenCalledTimes(5);
    expect(mocks.execa).toHaveBeenNthCalledWith(
      1,
      "tmux",
      ["-L", "sock", "-S", "/tmp/tmux.sock", "switch-client", "-t", "client-1"],
      { timeout: 2000 },
    );
    expect(mocks.execa).toHaveBeenNthCalledWith(
      2,
      "tmux",
      [
        "-L",
        "sock",
        "-S",
        "/tmp/tmux.sock",
        "display-message",
        "-p",
        "-t",
        "%1",
        "-F",
        "#{session_name}",
      ],
      { timeout: 2000 },
    );
    expect(mocks.execa).toHaveBeenNthCalledWith(
      3,
      "tmux",
      ["-L", "sock", "-S", "/tmp/tmux.sock", "switch-client", "-t", "dev-session"],
      { timeout: 2000 },
    );
    expect(mocks.execa).toHaveBeenNthCalledWith(
      4,
      "tmux",
      ["-L", "sock", "-S", "/tmp/tmux.sock", "select-window", "-t", "%1"],
      { timeout: 2000 },
    );
    expect(mocks.execa).toHaveBeenNthCalledWith(
      5,
      "tmux",
      ["-L", "sock", "-S", "/tmp/tmux.sock", "select-pane", "-t", "%1"],
      { timeout: 2000 },
    );
  });

  it("continues selecting window and pane even when session lookup fails", async () => {
    mocks.execa
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockRejectedValueOnce(new Error("session lookup failed"))
      .mockResolvedValueOnce({ stdout: "" })
      .mockResolvedValueOnce({ stdout: "" });

    await focusTmuxPane("%7", { primaryClient: "client-1" });

    expect(mocks.execa).toHaveBeenCalledTimes(4);
    expect(mocks.execa).toHaveBeenNthCalledWith(3, "tmux", ["select-window", "-t", "%7"], {
      timeout: 2000,
    });
    expect(mocks.execa).toHaveBeenNthCalledWith(4, "tmux", ["select-pane", "-t", "%7"], {
      timeout: 2000,
    });
  });
});

describe("getPaneGeometry", () => {
  it("parses pane geometry from tmux output", async () => {
    mocks.execa.mockResolvedValueOnce({
      stdout: "10\t20\t80\t24\t160\t48",
    });

    const geometry = await getPaneGeometry("%3", { socketName: "sock" });

    expect(geometry).toEqual({
      left: 10,
      top: 20,
      width: 80,
      height: 24,
      windowWidth: 160,
      windowHeight: 48,
    });
    expect(mocks.execa).toHaveBeenCalledWith(
      "tmux",
      [
        "-L",
        "sock",
        "display-message",
        "-p",
        "-t",
        "%3",
        "-F",
        "#{pane_left}\t#{pane_top}\t#{pane_width}\t#{pane_height}\t#{window_width}\t#{window_height}",
      ],
      { timeout: 2000 },
    );
  });

  it("returns null when output cannot be parsed", async () => {
    mocks.execa.mockResolvedValueOnce({ stdout: "bad\tdata" });

    const geometry = await getPaneGeometry("%3");

    expect(geometry).toBeNull();
  });

  it("returns null when tmux command fails", async () => {
    mocks.execa.mockRejectedValueOnce(new Error("tmux unavailable"));

    const geometry = await getPaneGeometry("%3");

    expect(geometry).toBeNull();
  });
});
