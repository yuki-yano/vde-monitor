import { asNonEmptyString, asNumber, isRecord } from "../parse-utils";
import { fetchWithTimeout } from "../fetch-utils";

import { UsageProviderError } from "../usage-shared/usage-error";
import {
  type ClaudeOauthCredential,
  asEpochMs,
  sortKeychainCredentialCandidates,
} from "./claude-keychain-parser";
import { type KeychainReader, defaultKeychainReader } from "./claude-keychain-reader";

type ClaudeUsageWindow = {
  utilizationPercent: number;
  resetsAt: string | null;
  windowDurationMins: number;
};

type ClaudeModelUsageWindow = ClaudeUsageWindow & {
  modelLabel: string;
};

export type ClaudeOauthUsageResponse = {
  fiveHour: ClaudeUsageWindow;
  sevenDay: ClaudeUsageWindow;
  modelWindows: ClaudeModelUsageWindow[];
};

type FetchClaudeOauthUsageOptions = {
  token: string;
  timeoutMs?: number;
};

type FetchClaudeOauthUsageWithFallbackOptions = {
  timeoutMs?: number;
  reader?: KeychainReader;
};

const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_USAGE_BETA_HEADER = "oauth-2025-04-20";
const CLAUDE_OAUTH_REFRESH_ENDPOINT = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_DEFAULT_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_FIVE_HOUR_MINS = 300;
const CLAUDE_SEVEN_DAY_MINS = 10_080;
const DEFAULT_TIMEOUT_MS = 5_000;

const asIsoString = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

const parseWindow = (value: unknown, windowDurationMins: number): ClaudeUsageWindow | null => {
  if (!isRecord(value)) {
    return null;
  }
  const utilization = asNumber(value.utilization ?? value.utilizationPercent);
  if (utilization == null) {
    return null;
  }
  return {
    utilizationPercent: utilization,
    resetsAt: asIsoString(value.resets_at ?? value.resetsAt),
    windowDurationMins,
  };
};

const parseModelWindows = (value: unknown): ClaudeModelUsageWindow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((limit) => {
    if (!isRecord(limit) || limit.kind !== "weekly_scoped" || !isRecord(limit.scope)) {
      return [];
    }
    const model = limit.scope.model;
    if (!isRecord(model)) {
      return [];
    }
    const modelLabel = asNonEmptyString(model.display_name);
    const utilizationPercent = asNumber(limit.percent);
    if (!modelLabel || utilizationPercent == null) {
      return [];
    }
    return [
      {
        modelLabel,
        utilizationPercent,
        resetsAt: asIsoString(limit.resets_at),
        windowDurationMins: CLAUDE_SEVEN_DAY_MINS,
      },
    ];
  });
};

const parseClaudeOauthUsage = (value: unknown): ClaudeOauthUsageResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  const fiveHour = parseWindow(value.five_hour ?? value.fiveHour, CLAUDE_FIVE_HOUR_MINS);
  const sevenDay = parseWindow(value.seven_day ?? value.sevenDay, CLAUDE_SEVEN_DAY_MINS);
  if (!fiveHour || !sevenDay) {
    return null;
  }
  return {
    fiveHour,
    sevenDay,
    modelWindows: parseModelWindows(value.limits),
  };
};

const parseRefreshResponse = (
  value: unknown,
  nowMs: number,
): Pick<ClaudeOauthCredential, "accessToken" | "refreshToken" | "expiresAtMs"> | null => {
  if (!isRecord(value)) {
    return null;
  }
  const accessToken = asNonEmptyString(value.access_token) ?? asNonEmptyString(value.accessToken);
  if (!accessToken) {
    return null;
  }
  const refreshToken =
    asNonEmptyString(value.refresh_token) ?? asNonEmptyString(value.refreshToken) ?? null;
  const expiresAtMs =
    asEpochMs(value.expires_at ?? value.expiresAt) ??
    (() => {
      const expiresInSec = asNumber(value.expires_in ?? value.expiresIn);
      if (expiresInSec == null || expiresInSec <= 0) {
        return null;
      }
      return nowMs + expiresInSec * 1000;
    })();
  return {
    accessToken,
    refreshToken,
    expiresAtMs,
  };
};

const refreshClaudeOauthAccessToken = async ({
  refreshToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clientId,
}: {
  refreshToken: string;
  timeoutMs?: number;
  clientId?: string | null;
}): Promise<Pick<ClaudeOauthCredential, "accessToken" | "refreshToken" | "expiresAtMs">> => {
  const resolvedClientId =
    asNonEmptyString(clientId) ??
    asNonEmptyString(process.env.CLAUDE_CODE_OAUTH_CLIENT_ID) ??
    CLAUDE_DEFAULT_OAUTH_CLIENT_ID;
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: resolvedClientId,
    });
    const response = await fetchWithTimeout(
      CLAUDE_OAUTH_REFRESH_ENDPOINT,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
      timeoutMs,
    );

    if (response.status === 400 || response.status === 401) {
      throw new UsageProviderError(
        "TOKEN_INVALID",
        "Claude token is invalid or expired. Run claude login again.",
      );
    }
    if (!response.ok) {
      throw new UsageProviderError(
        "UPSTREAM_UNAVAILABLE",
        `Claude OAuth token refresh failed (${response.status})`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UsageProviderError(
        "UNSUPPORTED_RESPONSE",
        "Claude OAuth token refresh returned non-JSON response",
      );
    }

    const refreshed = parseRefreshResponse(data, Date.now());
    if (!refreshed) {
      throw new UsageProviderError(
        "UNSUPPORTED_RESPONSE",
        "Claude OAuth token refresh response format is unsupported",
      );
    }

    return refreshed;
  } catch (error) {
    if (error instanceof UsageProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new UsageProviderError("UPSTREAM_UNAVAILABLE", "Claude OAuth token refresh timed out");
    }
    throw new UsageProviderError("UPSTREAM_UNAVAILABLE", "Failed to refresh Claude OAuth token");
  }
};

const isTokenInvalidError = (error: unknown): error is UsageProviderError =>
  error instanceof UsageProviderError && error.code === "TOKEN_INVALID";

export const fetchClaudeOauthUsage = async ({
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchClaudeOauthUsageOptions): Promise<ClaudeOauthUsageResponse> => {
  try {
    const response = await fetchWithTimeout(
      CLAUDE_USAGE_ENDPOINT,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": CLAUDE_USAGE_BETA_HEADER,
          Accept: "application/json",
        },
      },
      timeoutMs,
    );

    if (response.status === 401 || response.status === 403) {
      throw new UsageProviderError(
        "TOKEN_INVALID",
        "Claude token is invalid or expired. Run claude login again.",
      );
    }
    if (!response.ok) {
      throw new UsageProviderError(
        "UPSTREAM_UNAVAILABLE",
        `Claude usage API request failed (${response.status})`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UsageProviderError(
        "UNSUPPORTED_RESPONSE",
        "Claude usage API returned non-JSON response",
      );
    }

    const parsed = parseClaudeOauthUsage(data);
    if (!parsed) {
      throw new UsageProviderError(
        "UNSUPPORTED_RESPONSE",
        "Claude usage API response format is unsupported",
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof UsageProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new UsageProviderError("UPSTREAM_UNAVAILABLE", "Claude usage API request timed out");
    }
    throw new UsageProviderError("UPSTREAM_UNAVAILABLE", "Failed to fetch Claude usage data");
  }
};

export const resolveClaudeOauthToken = async ({
  reader = defaultKeychainReader,
}: { reader?: KeychainReader } = {}): Promise<string> => {
  const fileCredential = await reader.readTokenFromCredentialsFile();
  if (fileCredential) {
    return fileCredential.accessToken;
  }

  const keychainCredential = await reader.readTokenFromMacKeychain();
  if (keychainCredential) {
    await reader.persistCredentialToCredentialsFile(keychainCredential).catch(() => null);
    return keychainCredential.accessToken;
  }

  throw new UsageProviderError("TOKEN_NOT_FOUND", "Claude credential not found. Run claude login.");
};

export const fetchClaudeOauthUsageWithFallback = async ({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  reader = defaultKeychainReader,
}: FetchClaudeOauthUsageWithFallbackOptions = {}): Promise<ClaudeOauthUsageResponse> => {
  const fileCredential = await reader.readTokenFromCredentialsFile();
  let fileError: unknown = null;
  if (fileCredential) {
    try {
      return await fetchClaudeOauthUsage({ token: fileCredential.accessToken, timeoutMs });
    } catch (error) {
      fileError = error;
    }
  }

  const keychainCredentials = await reader.readCredentialsFromMacKeychain();
  if (keychainCredentials.length === 0) {
    if (fileError instanceof UsageProviderError) {
      throw fileError;
    }
    if (fileError) {
      throw fileError;
    }
    throw new UsageProviderError(
      "TOKEN_NOT_FOUND",
      "Claude credential not found. Run claude login.",
    );
  }

  let latestError: unknown = fileError;
  const orderedCredentials = sortKeychainCredentialCandidates(keychainCredentials);

  for (const { credential: keychainCredential } of orderedCredentials) {
    try {
      const usage = await fetchClaudeOauthUsage({
        token: keychainCredential.accessToken,
        timeoutMs,
      });
      await reader.persistCredentialToCredentialsFile(keychainCredential).catch(() => null);
      return usage;
    } catch (error) {
      latestError = error;
      if (!isTokenInvalidError(error) || keychainCredential.refreshToken == null) {
        continue;
      }
    }

    try {
      const refreshed = await refreshClaudeOauthAccessToken({
        refreshToken: keychainCredential.refreshToken,
        timeoutMs,
        clientId: keychainCredential.clientId,
      });
      const usage = await fetchClaudeOauthUsage({ token: refreshed.accessToken, timeoutMs });
      await reader
        .persistCredentialToCredentialsFile({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? keychainCredential.refreshToken,
          expiresAtMs: refreshed.expiresAtMs,
          clientId: keychainCredential.clientId,
        })
        .catch(() => null);
      return usage;
    } catch (error) {
      latestError = error;
      continue;
    }
  }

  if (latestError instanceof Error) {
    throw latestError;
  }
  throw new UsageProviderError("TOKEN_NOT_FOUND", "Claude credential not found. Run claude login.");
};
