import { describe, expect, it } from "vitest";

import { resolveSummaryPublishEndpointFromConnectionInfo } from "./summary-event";

describe("resolveSummaryPublishEndpointFromConnectionInfo", () => {
  it("accepts loopback listener endpoint", () => {
    const endpoint = resolveSummaryPublishEndpointFromConnectionInfo({
      schemaVersion: 1,
      endpoint: "http://127.0.0.1:11080/api/notifications/summary-events",
      listenerType: "loopback",
      bind: "127.0.0.1",
      tokenRef: "server-token",
    });

    expect(endpoint).toBe("http://127.0.0.1:11080/api/notifications/summary-events");
  });

  it("accepts network listener endpoint when host matches bind", () => {
    const endpoint = resolveSummaryPublishEndpointFromConnectionInfo({
      schemaVersion: 1,
      endpoint: "http://100.64.0.10:11080/api/notifications/summary-events",
      listenerType: "network",
      bind: "100.64.0.10",
      tokenRef: "server-token",
    });

    expect(endpoint).toBe("http://100.64.0.10:11080/api/notifications/summary-events");
  });

  it("rejects network listener endpoint when host does not match bind", () => {
    const endpoint = resolveSummaryPublishEndpointFromConnectionInfo({
      schemaVersion: 1,
      endpoint: "http://100.64.0.10:11080/api/notifications/summary-events",
      listenerType: "network",
      bind: "100.64.0.11",
      tokenRef: "server-token",
    });

    expect(endpoint).toBeNull();
  });
});
