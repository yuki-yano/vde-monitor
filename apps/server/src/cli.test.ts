import { describe, expect, it } from "vitest";

import { parseArgs, resolveHosts, resolveMultiplexerOverrides } from "./cli";

const baseOptions = {
  configBind: "127.0.0.1" as const,
  getLocalIP: () => "192.168.0.2",
  getTailscaleIP: () => "100.64.0.1",
};

describe("parseArgs", () => {
  it("parses command and long flags", () => {
    const result = parseArgs([
      "token",
      "rotate",
      "--public",
      "--bind",
      "192.168.0.10",
      "--port",
      "3000",
      "--multiplexer",
      "wezterm",
      "--backend",
      "wezterm",
      "--no-attach",
    ]);

    expect(result.command).toBe("token");
    expect(result.subcommand).toBe("rotate");
    expect(result.public).toBe(true);
    expect(result.bind).toBe("192.168.0.10");
    expect(result.port).toBe("3000");
    expect(result.multiplexer).toBe("wezterm");
    expect(result.backend).toBe("wezterm");
    expect(result.attach).toBe(false);
  });

  it("keeps unknown flags on raw parsed output", () => {
    const result = parseArgs(["--foo", "bar", "--no-cache"]);

    expect(result.command).toBe("bar");
    expect(result.foo).toBe(true);
    expect(result.cache).toBe(false);
  });

  it("ignores separators passed through tsx/pnpm", () => {
    const result = parseArgs(["--", "--", "--public", "--tailscale"]);

    expect(result.command).toBeUndefined();
    expect(result.public).toBe(true);
    expect(result.tailscale).toBe(true);
  });

  it("keeps raw string values without numeric coercion", () => {
    const result = parseArgs(["--socket-name", "01", "--port", "-1"]);

    expect(result.socketName).toBe("01");
    expect(result.port).toBe("-1");
  });

  it("rejects invalid enum values", () => {
    expect(() => parseArgs(["--multiplexer", "foo"])).toThrow(/Invalid value for argument/);
    expect(() => parseArgs(["--backend", "foo"])).toThrow(/Invalid value for argument/);
  });
});

describe("resolveHosts", () => {
  it("uses default bind and localhost display when no flags", () => {
    const result = resolveHosts({ ...baseOptions, args: parseArgs([]) });
    expect(result).toEqual({ bindHost: "127.0.0.1", displayHost: "localhost" });
  });

  it("uses local IP display when public", () => {
    const result = resolveHosts({ ...baseOptions, args: parseArgs(["--public"]) });
    expect(result).toEqual({ bindHost: "0.0.0.0", displayHost: "192.168.0.2" });
  });

  it("binds to tailscale when requested", () => {
    const result = resolveHosts({ ...baseOptions, args: parseArgs(["--tailscale"]) });
    expect(result).toEqual({ bindHost: "100.64.0.1", displayHost: "100.64.0.1" });
  });

  it("prints tailscale URL while binding to 0.0.0.0 when public + tailscale", () => {
    const result = resolveHosts({
      ...baseOptions,
      args: parseArgs(["--public", "--tailscale"]),
    });
    expect(result).toEqual({ bindHost: "0.0.0.0", displayHost: "100.64.0.1" });
  });

  it("uses bind value when provided", () => {
    const result = resolveHosts({
      ...baseOptions,
      args: parseArgs(["--bind", "192.168.0.10"]),
    });
    expect(result).toEqual({ bindHost: "192.168.0.10", displayHost: "192.168.0.10" });
  });

  it("rejects bind + tailscale", () => {
    expect(() =>
      resolveHosts({
        ...baseOptions,
        args: parseArgs(["--bind", "192.168.0.10", "--tailscale"]),
      }),
    ).toThrow(/--bind and --tailscale/);
  });

  it("fails when tailscale IP is not available", () => {
    expect(() =>
      resolveHosts({
        ...baseOptions,
        getTailscaleIP: () => null,
        args: parseArgs(["--tailscale"]),
      }),
    ).toThrow(/Tailscale IP not found/);
  });

  it("rejects bind without value", () => {
    expect(() =>
      resolveHosts({
        ...baseOptions,
        args: parseArgs(["--bind"]),
      }),
    ).toThrow(/--bind requires a value/);
  });
});

describe("resolveMultiplexerOverrides", () => {
  it("resolves multiplexer/backend and wezterm flags", () => {
    const result = resolveMultiplexerOverrides(
      parseArgs([
        "--multiplexer",
        "wezterm",
        "--backend",
        "ghostty",
        "--wezterm-cli",
        "/opt/homebrew/bin/wezterm",
        "--wezterm-target",
        " dev ",
      ]),
    );

    expect(result).toEqual({
      multiplexerBackend: "wezterm",
      screenImageBackend: "ghostty",
      weztermCliPath: "/opt/homebrew/bin/wezterm",
      weztermTarget: " dev ",
    });
  });

  it("resolves backend as screen image backend", () => {
    const result = resolveMultiplexerOverrides(parseArgs(["--backend", "terminal"]));
    expect(result).toEqual({ screenImageBackend: "terminal" });
  });

  it("rejects missing values for wezterm flags", () => {
    expect(() => resolveMultiplexerOverrides(parseArgs(["--wezterm-cli"]))).toThrow(
      /--wezterm-cli requires a value/,
    );
    expect(() => resolveMultiplexerOverrides(parseArgs(["--wezterm-target"]))).toThrow(
      /--wezterm-target requires a value/,
    );
  });
});
