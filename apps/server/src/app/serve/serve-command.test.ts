import { describe, expect, it } from "vitest";

import {
  buildTailscaleServeCommand,
  buildTailscaleServeProxyTarget,
  collectServeProxyTargets,
  matchesExpectedTailscaleServeTarget,
} from "./serve-command";

describe("buildTailscaleServeProxyTarget", () => {
  it("builds an HTTP upstream target from host and port", () => {
    expect(
      buildTailscaleServeProxyTarget({
        proxyHost: "127.0.0.1",
        displayPort: 11080,
      }),
    ).toBe("http://127.0.0.1:11080");
  });
});

describe("buildTailscaleServeCommand", () => {
  it("builds a serve command with explicit upstream target", () => {
    expect(buildTailscaleServeCommand("http://100.102.60.85:11080")).toBe(
      "tailscale serve --bg http://100.102.60.85:11080",
    );
  });
});

describe("collectServeProxyTargets", () => {
  it("collects and deduplicates HTTP proxy targets from serve status json", () => {
    const status = {
      Web: {
        "device.tail123.ts.net:443": {
          Handlers: {
            "/": {
              Proxy: "http://127.0.0.1:11080",
            },
            "/api": {
              Proxy: "http://100.102.60.85:11080/",
            },
          },
        },
      },
      Services: [{ Proxy: "http://127.0.0.1:11080" }],
    };

    expect(collectServeProxyTargets(status).sort()).toEqual([
      "http://100.102.60.85:11080",
      "http://127.0.0.1:11080",
    ]);
  });
});

describe("matchesExpectedTailscaleServeTarget", () => {
  it("returns true when serve status includes expected upstream", () => {
    const status = {
      Web: {
        "device.tail123.ts.net:443": {
          Handlers: {
            "/": {
              Proxy: "http://100.102.60.85:11080/",
            },
          },
        },
      },
    };

    expect(
      matchesExpectedTailscaleServeTarget({
        serveStatus: status,
        expectedProxyTarget: "http://100.102.60.85:11080",
      }),
    ).toBe(true);
  });

  it("returns false when serve status does not include expected upstream", () => {
    const status = {
      Web: {
        "device.tail123.ts.net:443": {
          Handlers: {
            "/": {
              Proxy: "http://127.0.0.1:11080",
            },
          },
        },
      },
    };

    expect(
      matchesExpectedTailscaleServeTarget({
        serveStatus: status,
        expectedProxyTarget: "http://100.102.60.85:11080",
      }),
    ).toBe(false);
  });
});
