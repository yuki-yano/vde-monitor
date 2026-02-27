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

  it("refreshes expired token and retries usage request", async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "stale-token",
          refreshToken: "refresh-token",
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
            access_token: "refreshed-token",
          }),
          {
            status: 200,
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
              utilization: 12,
              resets_at: "2026-02-25T10:00:00.000Z",
            },
            seven_day: {
              utilization: 34,
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

    expect(usage.fiveHour.utilizationPercent).toBe(12);
    expect(usage.sevenDay.utilizationPercent).toBe(34);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/api/oauth/usage");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://platform.claude.com/v1/oauth/token");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.anthropic.com/api/oauth/usage");

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    const secondMethod = fetchMock.mock.calls[1]?.[1]?.method;
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body;
    const thirdHeaders = fetchMock.mock.calls[2]?.[1]?.headers as
      | Record<string, string>
      | undefined;

    expect(firstHeaders?.Authorization).toBe("Bearer stale-token");
    expect(secondMethod).toBe("POST");
    expect(typeof secondBody).toBe("string");
    expect(secondBody).toContain("grant_type=refresh_token");
    expect(secondBody).toContain("refresh_token=refresh-token");
    expect(secondBody).toContain("client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e");
    expect(thirdHeaders?.Authorization).toBe("Bearer refreshed-token");
  });
});
