import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.readFile,
  },
  readFile: mocks.readFile,
}));

import { fetchClaudeOauthUsageWithFallback } from "./claude-usage-service";

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

const setProcessPlatform = (platform: NodeJS.Platform) => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
};

describe("fetchClaudeOauthUsageWithFallback", () => {
  const originalEnvToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    setProcessPlatform("linux");
    vi.unstubAllGlobals();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnvToken == null) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalEnvToken;
    }
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("falls back to credentials file token when env token is invalid", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "env-token";
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-token",
        },
      }),
    );

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "authentication_error", message: "Invalid bearer token" },
          }),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            five_hour: {
              utilization: 10,
              resets_at: "2026-02-25T10:00:00.000Z",
            },
            seven_day: {
              utilization: 20,
              resets_at: "2026-03-01T10:00:00.000Z",
            },
            seven_day_sonnet: null,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const usage = await fetchClaudeOauthUsageWithFallback({ timeoutMs: 1_000 });

    expect(usage.fiveHour.utilizationPercent).toBe(10);
    expect(usage.sevenDay.utilizationPercent).toBe(20);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as
      | Record<string, string>
      | undefined;

    expect(firstHeaders?.Authorization).toBe("Bearer env-token");
    expect(secondHeaders?.Authorization).toBe("Bearer file-token");
  });
});
