import { describe, expect, it } from "vitest";

import {
  decodePaneId,
  encodePaneId,
  normalizeWeztermTarget,
  resolveHerdrServerKey,
  resolveLogPaths,
  resolveMonitorServerKey,
  resolveServerKey,
  resolveWeztermServerKey,
  sanitizeServerKey,
} from "./paths";

describe("encode/decode paneId", () => {
  it("encodes and decodes pane IDs safely", () => {
    const original = "%12";
    const encoded = encodePaneId(original);
    expect(encoded).toBe("%2512");
    expect(decodePaneId(encoded)).toBe(original);
  });

  it("round-trips pane IDs with spaces", () => {
    const original = "pane id";
    const encoded = encodePaneId(original);
    expect(decodePaneId(encoded)).toBe(original);
  });

  it("returns raw value when decoding fails", () => {
    const original = "%8";
    expect(decodePaneId(original)).toBe(original);
  });
});

describe("sanitizeServerKey", () => {
  it("replaces slashes with underscores and other symbols with dashes", () => {
    expect(sanitizeServerKey("tmux/socket:name")).toBe("tmux_socket-name");
  });

  it("preserves underscores and dashes", () => {
    expect(sanitizeServerKey("a_b-c")).toBe("a_b-c");
  });
});

describe("resolveServerKey", () => {
  it("prefers socketName over socketPath", () => {
    expect(resolveServerKey("my/socket", "/tmp/tmux.sock")).toBe("my_socket");
  });

  it("falls back to socketPath when socketName is empty", () => {
    expect(resolveServerKey("  ", "/tmp/tmux.sock")).toBe("_tmp_tmux-sock");
  });

  it("returns default when both socketName and socketPath are empty", () => {
    expect(resolveServerKey(" ", " ")).toBe("default");
  });

  it("handles null values", () => {
    expect(resolveServerKey(null, null)).toBe("default");
  });
});

describe("normalizeWeztermTarget", () => {
  it("normalizes null, blank and auto to auto", () => {
    expect(normalizeWeztermTarget(null)).toBe("auto");
    expect(normalizeWeztermTarget("")).toBe("auto");
    expect(normalizeWeztermTarget("   ")).toBe("auto");
    expect(normalizeWeztermTarget("auto")).toBe("auto");
  });

  it("trims and keeps explicit target names", () => {
    expect(normalizeWeztermTarget(" dev ")).toBe("dev");
  });
});

describe("resolveWeztermServerKey", () => {
  it("uses same key for null/blank/auto", () => {
    const base = resolveWeztermServerKey(null);
    expect(resolveWeztermServerKey("")).toBe(base);
    expect(resolveWeztermServerKey("   ")).toBe(base);
    expect(resolveWeztermServerKey("auto")).toBe(base);
  });

  it("normalizes trimmed targets to same key", () => {
    expect(resolveWeztermServerKey(" dev ")).toBe(resolveWeztermServerKey("dev"));
  });
});

describe("resolveMonitorServerKey", () => {
  it("uses tmux socket key when backend is tmux", () => {
    expect(
      resolveMonitorServerKey({
        multiplexerBackend: "tmux",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: "dev",
      }),
    ).toBe("my_socket");
  });

  it("uses wezterm key when backend is wezterm", () => {
    expect(
      resolveMonitorServerKey({
        multiplexerBackend: "wezterm",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: "dev",
      }),
    ).toBe(resolveWeztermServerKey("dev"));
  });

  it("uses herdr socket path key when backend is herdr", () => {
    expect(
      resolveMonitorServerKey({
        multiplexerBackend: "herdr",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: "dev",
        herdrSocketPath: "/Users/u/.config/herdr/herdr.sock",
      }),
    ).toBe(resolveHerdrServerKey("/Users/u/.config/herdr/herdr.sock"));
  });
});

describe("resolveLogPaths", () => {
  it("encodes paneId into a percent-free pane log file id", () => {
    const paths = resolveLogPaths("/base", "server", "%1");
    expect(paths.paneIdEncoded).toBe("%251");
    expect(paths.paneLogPath).toBe("/base/panes/server/_p251.log");
    expect(paths.eventLogPath).toBe("/base/events/server/claude.jsonl");
  });

  it("handles special pane IDs without collisions", () => {
    const paths = resolveLogPaths("/base", "server", "%1/2");
    const collidingCandidate = resolveLogPaths("/base", "server", "%12F2");
    expect(paths.paneIdEncoded).toBe("%251%2F2");
    expect(paths.paneLogPath).toBe("/base/panes/server/_p251_p2F2.log");
    expect(collidingCandidate.paneLogPath).toBe("/base/panes/server/_p2512F2.log");
    expect(paths.paneLogPath).not.toBe(collidingCandidate.paneLogPath);
  });
});
