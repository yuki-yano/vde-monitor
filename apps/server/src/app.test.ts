import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { rotateToken } from "./config";
import {
  authHeaders,
  createTestContext,
  createTestStreamDeps,
} from "./http/api-router.test-helpers";

vi.mock("./config", () => ({
  rotateToken: vi.fn(() => ({ token: "rotated-token" })),
}));

const createAppUnderTest = () => {
  const context = createTestContext();
  const streamDeps = createTestStreamDeps();
  const { app } = createApp({
    config: context.config,
    monitor: context.monitor,
    actions: context.actions,
    launchCapability: context.launchCapability,
    notificationService: context.notificationService,
    ...streamDeps,
  });
  return { app, ...context, ...streamDeps };
};

describe("createApp /api/admin/token/rotate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects token rotation without auth", async () => {
    const { app } = createAppUnderTest();

    const res = await app.request("/api/admin/token/rotate", { method: "POST" });

    expect(res.status).toBe(401);
    expect(rotateToken).not.toHaveBeenCalled();
  });

  it("rotates the token and revokes push subscriptions with valid auth", async () => {
    const { app, config, notificationService } = createAppUnderTest();

    const res = await app.request("/api/admin/token/rotate", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "rotated-token" });
    expect(config.token).toBe("rotated-token");
    expect(notificationService.removeAllSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("invalidates the previous token after rotation", async () => {
    const { app } = createAppUnderTest();

    await app.request("/api/admin/token/rotate", {
      method: "POST",
      headers: authHeaders,
    });

    const oldTokenRes = await app.request("/api/sessions", { headers: authHeaders });
    expect(oldTokenRes.status).toBe(401);

    const newTokenRes = await app.request("/api/sessions", {
      headers: { Authorization: "Bearer rotated-token" },
    });
    expect(newTokenRes.status).toBe(200);
  });
});
