import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
  },
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}));

vi.mock("node:child_process", () => ({
  default: {
    execFile: mocks.execFile,
  },
  execFile: mocks.execFile,
}));

import { fetchClaudeOauthUsageWithFallback } from "./claude-usage-service";

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

const setProcessPlatform = (platform: NodeJS.Platform) => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
};

const toHex = (value: string) => Buffer.from(value, "utf8").toString("hex");

describe("fetchClaudeOauthUsageWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    setProcessPlatform("linux");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("reads ~/.claude/.credentials.json first and uses its token for usage API", async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-token",
          refreshToken: "file-refresh-token",
        },
      }),
    );

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer file-token");
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("falls back to Keychain when .credentials.json token fails and saves retrieved credentials", async () => {
    setProcessPlatform("darwin");
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-stale-token",
        },
      }),
    );

    const keychainPayload =
      `\u0007"claudeAiOauth":${JSON.stringify({
        accessToken: "keychain-token",
        refreshToken: "keychain-refresh-token",
        expiresAt: 1_773_000_000_000,
        clientId: "client-from-keychain",
      })},` + `"mcpOAuth":{"cloudflare-browser":{"resource_name":0`;
    mocks.execFile.mockImplementation((_, __, callback: (...args: unknown[]) => void) => {
      callback(null, toHex(keychainPayload), "");
      return {} as never;
    });

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
              utilization: 30,
              resets_at: "2026-02-25T10:00:00.000Z",
            },
            seven_day: {
              utilization: 40,
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

    expect(usage.fiveHour.utilizationPercent).toBe(30);
    expect(usage.sevenDay.utilizationPercent).toBe(40);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(firstHeaders?.Authorization).toBe("Bearer file-stale-token");
    expect(secondHeaders?.Authorization).toBe("Bearer keychain-token");
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenContent] = mocks.writeFile.mock.calls[0] ?? [];
    expect(String(writtenPath)).toContain(".claude/.credentials.json");
    expect(String(writtenContent)).toContain("keychain-token");
    expect(String(writtenContent)).toContain("keychain-refresh-token");
  });

  it("discovers suffixed Claude keychain service via dump-keychain and uses it", async () => {
    setProcessPlatform("darwin");
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-stale-token",
        },
      }),
    );

    const keychainDump = `class: "genp"
attributes:
    "mdat"<timedate>=0x32303236303330313132353235345A00  "20260301125254Z\\000"
    "svce"<blob>="Claude Code-credentials"
class: "genp"
attributes:
    "mdat"<timedate>=0x32303236303330313132353034365A00  "20260301125046Z\\000"
    "svce"<blob>="Claude Code-credentials-d9c45eec"`;

    mocks.execFile.mockImplementation(
      (_file, args: string[], callback: (...callbackArgs: unknown[]) => void) => {
        if (args[0] === "dump-keychain") {
          callback(null, keychainDump, "");
          return {} as never;
        }
        if (args[0] !== "find-generic-password") {
          callback(new Error(`unexpected command: ${args.join(" ")}`), "", "");
          return {} as never;
        }

        const serviceName = args.at(-1);
        if (serviceName === "Claude Code-credentials-d9c45eec") {
          callback(
            null,
            JSON.stringify({
              claudeAiOauth: {
                accessToken: "keychain-fresh-token",
                refreshToken: "keychain-fresh-refresh-token",
                expiresAt: 1_773_000_000_000,
              },
            }),
            "",
          );
          return {} as never;
        }

        callback(new Error("service not found"), "", "");
        return {} as never;
      },
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
              utilization: 12,
              resets_at: "2026-03-01T10:00:00.000Z",
            },
            seven_day: {
              utilization: 34,
              resets_at: "2026-03-08T10:00:00.000Z",
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(firstHeaders?.Authorization).toBe("Bearer file-stale-token");
    expect(secondHeaders?.Authorization).toBe("Bearer keychain-fresh-token");
    expect(mocks.execFile).toHaveBeenCalledWith(
      "security",
      ["dump-keychain", "login.keychain-db"],
      expect.any(Function),
    );
    expect(
      mocks.execFile.mock.calls.some(
        (call) =>
          Array.isArray(call[1]) &&
          (call[1] as string[])[0] === "dump-keychain" &&
          !(call[1] as string[]).includes("-d"),
      ),
    ).toBe(true);
    const [writtenPath, writtenContent] = mocks.writeFile.mock.calls[0] ?? [];
    expect(String(writtenPath)).toContain(".claude/.credentials.json");
    expect(String(writtenContent)).toContain("keychain-fresh-token");
    expect(String(writtenContent)).toContain("keychain-fresh-refresh-token");
  });

  it("refreshes with Keychain refresh token when Keychain access token is invalid", async () => {
    setProcessPlatform("darwin");
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "file-stale-token",
        },
      }),
    );
    mocks.execFile.mockImplementation((_, __, callback: (...args: unknown[]) => void) => {
      callback(
        null,
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "keychain-stale-token",
            refreshToken: "keychain-refresh-token",
            clientId: "keychain-client-id",
          },
        }),
        "",
      );
      return {} as never;
    });

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
            refresh_token: "refreshed-refresh-token",
            expires_in: 3600,
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
              utilization: 55,
              resets_at: "2026-02-25T10:00:00.000Z",
            },
            seven_day: {
              utilization: 65,
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

    expect(usage.fiveHour.utilizationPercent).toBe(55);
    expect(usage.sevenDay.utilizationPercent).toBe(65);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const refreshBody = fetchMock.mock.calls[2]?.[1]?.body;
    expect(typeof refreshBody).toBe("string");
    expect(refreshBody).toContain("refresh_token=keychain-refresh-token");
    expect(refreshBody).toContain("client_id=keychain-client-id");
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    const [, writtenContent] = mocks.writeFile.mock.calls[0] ?? [];
    expect(String(writtenContent)).toContain("refreshed-token");
    expect(String(writtenContent)).toContain("refreshed-refresh-token");
  });

  it("throws TOKEN_NOT_FOUND when .credentials.json and Keychain are both unavailable", async () => {
    setProcessPlatform("darwin");
    mocks.readFile.mockRejectedValue(new Error("not found"));
    mocks.execFile.mockImplementation((_, __, callback: (...args: unknown[]) => void) => {
      callback(new Error("not found"), "", "");
      return {} as never;
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    await expect(fetchClaudeOauthUsageWithFallback({ timeoutMs: 1_000 })).rejects.toMatchObject({
      code: "TOKEN_NOT_FOUND",
    });
  });
});
