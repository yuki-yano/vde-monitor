import { describe, expect, it } from "vitest";

import { resolveHerdrServerKey, resolveWeztermServerKey } from "../paths";
import {
  resolveCmuxServerKey,
  resolveMonitorRuntimeMarkerDirectory,
  resolveMonitorRuntimeMarkerPath,
  resolveMonitorServerKey,
} from "./monitor-runtime";

describe("resolveCmuxServerKey", () => {
  it("normalizes null and blank paths to auto", () => {
    const auto = resolveCmuxServerKey(null);
    expect(resolveCmuxServerKey(undefined)).toBe(auto);
    expect(resolveCmuxServerKey("   ")).toBe(auto);
  });

  it("uses an explicit socket path without exposing credentials", () => {
    expect(resolveCmuxServerKey(" /tmp/cmux.sock ")).toMatch(/^cmux-_tmp_cmux-sock-[a-f0-9]{12}$/);
  });

  it("keeps lossy-readable socket paths distinct with a hash suffix", () => {
    expect(resolveCmuxServerKey("/tmp/cmux.sock")).not.toBe(resolveCmuxServerKey("/tmp/cmux-sock"));
  });
});

describe("resolveMonitorRuntimeMarkerPath", () => {
  it("places a process-owned marker beside the backend event logs", () => {
    expect(resolveMonitorRuntimeMarkerDirectory("/base", "cmux-socket")).toBe(
      "/base/events/cmux-socket",
    );
    expect(resolveMonitorRuntimeMarkerPath("/base", "cmux-socket", 1234)).toBe(
      "/base/events/cmux-socket/.runtime.1234.json",
    );
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

  it("uses cmux socket path key when backend is cmux", () => {
    expect(
      resolveMonitorServerKey({
        multiplexerBackend: "cmux",
        tmuxSocketName: null,
        tmuxSocketPath: null,
        weztermTarget: null,
        cmuxSocketPath: "/tmp/cmux.sock",
      }),
    ).toBe(resolveCmuxServerKey("/tmp/cmux.sock"));
  });
});
