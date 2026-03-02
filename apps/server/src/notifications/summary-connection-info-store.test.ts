import { describe, expect, it } from "vitest";

import { buildSummaryConnectionInfo } from "./summary-connection-info-store";

describe("buildSummaryConnectionInfo", () => {
  it("uses loopback endpoint when bind host is loopback", () => {
    const connectionInfo = buildSummaryConnectionInfo({
      bindHost: "127.0.0.1",
      port: 11080,
    });

    expect(connectionInfo).toEqual({
      schemaVersion: 1,
      endpoint: "http://127.0.0.1:11080/api/notifications/summary-events",
      listenerType: "loopback",
      bind: "127.0.0.1",
      tokenRef: "server-token",
    });
  });

  it("uses loopback endpoint when bind host is wildcard", () => {
    const connectionInfo = buildSummaryConnectionInfo({
      bindHost: "0.0.0.0",
      port: 11080,
    });

    expect(connectionInfo).toEqual({
      schemaVersion: 1,
      endpoint: "http://127.0.0.1:11080/api/notifications/summary-events",
      listenerType: "loopback",
      bind: "0.0.0.0",
      tokenRef: "server-token",
    });
  });

  it("uses network endpoint when bind host is non-loopback", () => {
    const connectionInfo = buildSummaryConnectionInfo({
      bindHost: "100.64.0.10",
      port: 11080,
    });

    expect(connectionInfo).toEqual({
      schemaVersion: 1,
      endpoint: "http://100.64.0.10:11080/api/notifications/summary-events",
      listenerType: "network",
      bind: "100.64.0.10",
      tokenRef: "server-token",
    });
  });
});
