import { describe, expect, it } from "vitest";

import { resolveHosts } from "./cli.js";

const makeFlags = (entries: Array<[string, string | boolean]>) => new Map(entries);

const baseOptions = {
  configBind: "127.0.0.1",
  getLocalIP: () => "192.168.0.2",
  getTailscaleIP: () => "100.64.0.1",
};

describe("resolveHosts", () => {
  it("uses default bind and localhost display when no flags", () => {
    const result = resolveHosts({ ...baseOptions, flags: makeFlags([]) });
    expect(result).toEqual({ bindHost: "127.0.0.1", displayHost: "localhost" });
  });

  it("uses local IP display when public", () => {
    const result = resolveHosts({ ...baseOptions, flags: makeFlags([["--public", true]]) });
    expect(result).toEqual({ bindHost: "0.0.0.0", displayHost: "192.168.0.2" });
  });

  it("binds to tailscale when requested", () => {
    const result = resolveHosts({ ...baseOptions, flags: makeFlags([["--tailscale", true]]) });
    expect(result).toEqual({ bindHost: "100.64.0.1", displayHost: "100.64.0.1" });
  });

  it("prints tailscale URL while binding to 0.0.0.0 when public + tailscale", () => {
    const result = resolveHosts({
      ...baseOptions,
      flags: makeFlags([
        ["--public", true],
        ["--tailscale", true],
      ]),
    });
    expect(result).toEqual({ bindHost: "0.0.0.0", displayHost: "100.64.0.1" });
  });

  it("uses bind value when provided", () => {
    const result = resolveHosts({
      ...baseOptions,
      flags: makeFlags([["--bind", "192.168.0.10"]]),
    });
    expect(result).toEqual({ bindHost: "192.168.0.10", displayHost: "192.168.0.10" });
  });

  it("rejects bind + tailscale", () => {
    expect(() =>
      resolveHosts({
        ...baseOptions,
        flags: makeFlags([
          ["--bind", "192.168.0.10"],
          ["--tailscale", true],
        ]),
      }),
    ).toThrow(/--bind and --tailscale/);
  });

  it("fails when tailscale IP is not available", () => {
    expect(() =>
      resolveHosts({
        ...baseOptions,
        getTailscaleIP: () => null,
        flags: makeFlags([["--tailscale", true]]),
      }),
    ).toThrow(/Tailscale IP not found/);
  });
});
