import { describe, expect, it } from "vitest";

import {
  parseArgs,
  parsePort,
  resolveHosts,
  resolveMultiplexerOverrides,
  resolvePaneLogDaemonCommandArgs,
} from "./cli";

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
      "cmux",
      "--backend",
      "wezterm",
    ]);

    expect(result.command).toBe("token");
    expect(result.subcommand).toBe("rotate");
    expect(result.public).toBe(true);
    expect(result.bind).toBe("192.168.0.10");
    expect(result.port).toBe("3000");
    expect(result.multiplexer).toBe("cmux");
    expect(result.backend).toBe("wezterm");
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--foo"])).toThrow("Unknown option: --foo");
    expect(() => parseArgs(["--no-cache"])).toThrow("Unknown option: --cache");
  });

  it("ignores separators passed through tsx/pnpm", () => {
    const result = parseArgs(["--", "--", "--public", "--tailscale", "--https"]);

    expect(result.command).toBeUndefined();
    expect(result.public).toBe(true);
    expect(result.tailscale).toBe(true);
    expect(result.https).toBe(true);
  });

  it("keeps raw string values without numeric coercion", () => {
    const result = parseArgs(["--socket-name", "01", "--port", "-1"]);

    expect(result.socketName).toBe("01");
    expect(result.port).toBe("-1");
  });

  it("parses --dry-run flag", () => {
    const result = parseArgs(["config", "prune", "--dry-run"]);

    expect(result.command).toBe("config");
    expect(result.subcommand).toBe("prune");
    expect(result.dryRun).toBe(true);
  });

  it("parses --help as an explicit option", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("rejects invalid enum values", () => {
    expect(() => parseArgs(["--multiplexer", "foo"])).toThrow(/Invalid value for argument/);
    expect(() => parseArgs(["--backend", "foo"])).toThrow(/Invalid value for argument/);
  });

  it("parses the hidden pane log daemon command", () => {
    const args = parseArgs([
      "internal",
      "pane-log-daemon",
      "--runtime-dir",
      "/tmp/pane-log-daemon",
      "--server-identity",
      "a".repeat(64),
    ]);

    expect(resolvePaneLogDaemonCommandArgs(args)).toEqual({
      runtimeDir: "/tmp/pane-log-daemon",
      serverIdentity: "a".repeat(64),
    });
  });

  it("rejects daemon options outside the hidden command", () => {
    expect(() => parseArgs(["--runtime-dir", "/tmp/daemon"])).toThrow(
      "only valid for the internal daemon",
    );
    expect(() => parseArgs(["config", "check", "--server-identity", "a".repeat(64)])).toThrow(
      "only valid for the internal daemon",
    );
  });

  it("rejects duplicate daemon options", () => {
    expect(() =>
      parseArgs([
        "internal",
        "pane-log-daemon",
        "--runtime-dir",
        "/tmp/a",
        "--runtime-dir",
        "/tmp/b",
      ]),
    ).toThrow("--runtime-dir may only be specified once");
  });
});

describe("resolvePaneLogDaemonCommandArgs", () => {
  const parseDaemonArgs = (options: string[]) =>
    parseArgs(["internal", "pane-log-daemon", ...options]);

  it.each([
    [[], "--runtime-dir requires a value"],
    [["--runtime-dir", "/tmp/daemon"], "--server-identity requires a value"],
  ])("rejects missing required daemon options", (options, message) => {
    expect(() => resolvePaneLogDaemonCommandArgs(parseDaemonArgs(options))).toThrow(message);
  });

  it("rejects relative runtime paths", () => {
    expect(() =>
      resolvePaneLogDaemonCommandArgs(
        parseDaemonArgs(["--runtime-dir", "daemon", "--server-identity", "a".repeat(64)]),
      ),
    ).toThrow("--runtime-dir must be absolute");
  });

  it.each(["a", "A".repeat(64), "0".repeat(63), "g".repeat(64)])(
    "rejects invalid server identity: %s",
    (value) => {
      expect(() =>
        resolvePaneLogDaemonCommandArgs(
          parseDaemonArgs(["--runtime-dir", "/tmp/daemon", "--server-identity", value]),
        ),
      ).toThrow("--server-identity must be a lowercase SHA-256 hex digest");
    },
  );

  it("rejects an extra positional command part", () => {
    expect(() =>
      parseArgs([
        "internal",
        "pane-log-daemon",
        "extra",
        "--runtime-dir",
        "/tmp/daemon",
        "--server-identity",
        "a".repeat(64),
      ]),
    ).toThrow("only valid for the internal daemon");
  });
});

describe("parsePort", () => {
  it.each([
    ["1", 1],
    ["11080", 11080],
    ["65535", 65535],
  ])("accepts a complete in-range integer: %s", (value, expected) => {
    expect(parsePort(value)).toBe(expected);
  });

  it.each(["0", "65536", "1.5", "11080junk", "-1", " 3000"])(
    "rejects an invalid port: %s",
    (value) => {
      expect(() => parsePort(value)).toThrow("port must be an integer between 1 and 65535");
    },
  );

  it("returns null only when the option is omitted", () => {
    expect(parsePort(undefined)).toBeNull();
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

  it("binds to localhost while keeping tailscale display host in tailscale+https mode", () => {
    const result = resolveHosts({ ...baseOptions, args: parseArgs(["--tailscale", "--https"]) });
    expect(result).toEqual({ bindHost: "127.0.0.1", displayHost: "100.64.0.1" });
  });

  it("prints tailscale URL while binding to 0.0.0.0 when public + tailscale", () => {
    const result = resolveHosts({
      ...baseOptions,
      args: parseArgs(["--public", "--tailscale"]),
    });
    expect(result).toEqual({ bindHost: "0.0.0.0", displayHost: "100.64.0.1" });
  });

  it("keeps the public bind when tailscale HTTPS is also enabled", () => {
    const result = resolveHosts({
      ...baseOptions,
      args: parseArgs(["--public", "--tailscale", "--https"]),
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
  it("resolves multiplexer/backend and multiplexer-specific flags", () => {
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
        "--cmux-cli",
        "/Applications/cmux.app/Contents/Resources/bin/cmux",
        "--cmux-socket",
        "/Users/test/.cmux/cmux.sock",
      ]),
    );

    expect(result).toEqual({
      multiplexerBackend: "wezterm",
      screenImageBackend: "ghostty",
      weztermCliPath: "/opt/homebrew/bin/wezterm",
      weztermTarget: " dev ",
      cmuxCliPath: "/Applications/cmux.app/Contents/Resources/bin/cmux",
      cmuxSocketPath: "/Users/test/.cmux/cmux.sock",
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
    expect(() => resolveMultiplexerOverrides(parseArgs(["--cmux-cli"]))).toThrow(
      /--cmux-cli requires a value/,
    );
    expect(() => resolveMultiplexerOverrides(parseArgs(["--cmux-socket"]))).toThrow(
      /--cmux-socket requires a value/,
    );
  });
});
