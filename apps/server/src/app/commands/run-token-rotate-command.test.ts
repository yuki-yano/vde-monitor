import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureConfig: vi.fn(() => ({ bind: "127.0.0.1", port: 18080, token: "old-token" })),
  readActiveServerRuntimeEndpoint: vi.fn(async () => ({ host: "127.0.0.1", port: 18081 })),
}));

vi.mock("../../config", () => ({
  ensureConfig: mocks.ensureConfig,
}));

vi.mock("../../server-runtime-marker", () => ({
  readActiveServerRuntimeEndpoint: mocks.readActiveServerRuntimeEndpoint,
}));

import { runTokenRotateCommand } from "./run-token-rotate-command";

describe("runTokenRotateCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureConfig.mockReturnValue({ bind: "127.0.0.1", port: 18080, token: "old-token" });
    mocks.readActiveServerRuntimeEndpoint.mockResolvedValue({ host: "127.0.0.1", port: 18081 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rotates through the running server and prints the active token", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ token: "new-token" }, { status: 200 }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runTokenRotateCommand({ fetchImpl: fetchImpl as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:18081/api/admin/token/rotate",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer old-token" },
      }),
    );
    expect(log).toHaveBeenCalledWith("new-token");
  });

  it("prints the committed token and warns when runtime cleanup is incomplete", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { token: "new-token", cleanupFailures: ["push-subscriptions"] },
        { status: 207 },
      ),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runTokenRotateCommand({ fetchImpl: fetchImpl as typeof fetch });

    expect(log).toHaveBeenCalledWith("new-token");
    expect(warn).toHaveBeenCalledWith(
      "Token rotation committed with incomplete cleanup: push-subscriptions",
    );
  });

  it("does not modify on-disk state when no running server is reachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      runTokenRotateCommand({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("token rotation requires the active vde-monitor server");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not send the persisted token when no owned runtime endpoint can be resolved", async () => {
    mocks.readActiveServerRuntimeEndpoint.mockRejectedValueOnce(new Error("stale marker"));
    const fetchImpl = vi.fn();

    await expect(
      runTokenRotateCommand({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("stale marker");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prints the persisted token when the server rotates before the response is lost", async () => {
    mocks.ensureConfig
      .mockReturnValueOnce({ bind: "127.0.0.1", port: 18080, token: "old-token" })
      .mockReturnValue({ bind: "127.0.0.1", port: 18080, token: "new-token" });
    const fetchImpl = vi.fn(async () => {
      throw new Error("response connection reset");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runTokenRotateCommand({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("new-token");
  });

  it("reconciles a persisted rotation even when the received response is not successful", async () => {
    mocks.ensureConfig
      .mockReturnValueOnce({ bind: "127.0.0.1", port: 18080, token: "old-token" })
      .mockReturnValue({ bind: "127.0.0.1", port: 18080, token: "new-token" });
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runTokenRotateCommand({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("new-token");
  });

  it("reports active/persisted token divergence as requiring a restart", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(
      runTokenRotateCommand({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("restart the server to reconcile state");
  });

  it("uses explicit bind and port overrides for a CLI-started server", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ token: "new-token" }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runTokenRotateCommand({
      fetchImpl: fetchImpl as typeof fetch,
      host: "0.0.0.0",
      port: 19000,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:19000/api/admin/token/rotate",
      expect.any(Object),
    );
  });

  it("rejects a non-IP endpoint without sending the persisted token", async () => {
    const fetchImpl = vi.fn();

    await expect(
      runTokenRotateCommand({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        host: "example.com",
      }),
    ).rejects.toThrow("must be an IPv4 address");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
