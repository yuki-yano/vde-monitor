import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { UsageProviderError } from "../usage-dashboard/usage-error";

type ClaudeUsageWindow = {
  utilizationPercent: number;
  resetsAt: string | null;
  windowDurationMins: number;
};

export type ClaudeOauthUsageResponse = {
  fiveHour: ClaudeUsageWindow;
  sevenDay: ClaudeUsageWindow;
  sevenDaySonnet: ClaudeUsageWindow | null;
};

type ClaudeOauthCredentialCandidate = {
  accessToken: string;
  refreshToken: string | null;
};

type FetchClaudeOauthUsageOptions = {
  token: string;
  timeoutMs?: number;
};

type FetchClaudeOauthUsageWithFallbackOptions = {
  timeoutMs?: number;
};

const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_USAGE_BETA_HEADER = "oauth-2025-04-20";
const CLAUDE_OAUTH_REFRESH_ENDPOINT = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_DEFAULT_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_FIVE_HOUR_MINS = 300;
const CLAUDE_SEVEN_DAY_MINS = 10_080;
const DEFAULT_TIMEOUT_MS = 5_000;
const execFileAsync = promisify(execFile);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

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

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  return normalized;
};

const extractOauthCredentialsFromObject = (
  value: unknown,
): ClaudeOauthCredentialCandidate | null => {
  if (!isRecord(value)) {
    return null;
  }

  const nestedCandidates = [value.claudeAiOauth, value.oauth, value.auth, value].filter(
    (candidate) => isRecord(candidate),
  );
  for (const candidate of nestedCandidates) {
    const accessToken =
      asNonEmptyString(candidate.accessToken) ??
      asNonEmptyString(candidate.access_token) ??
      asNonEmptyString(candidate.token) ??
      asNonEmptyString(candidate.oauthToken);
    if (!accessToken) {
      continue;
    }
    const refreshToken =
      asNonEmptyString(candidate.refreshToken) ?? asNonEmptyString(candidate.refresh_token);
    return {
      accessToken,
      refreshToken,
    };
  }
  return null;
};

const extractOauthCredentialsFromSecret = (
  secret: string,
): ClaudeOauthCredentialCandidate | null => {
  const normalized = secret.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (!normalized.startsWith("{") && !normalized.startsWith("[")) {
    return {
      accessToken: normalized,
      refreshToken: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return {
      accessToken: normalized,
      refreshToken: null,
    };
  }
  return extractOauthCredentialsFromObject(parsed);
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

const parseClaudeOauthUsage = (value: unknown): ClaudeOauthUsageResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  const fiveHour = parseWindow(value.five_hour ?? value.fiveHour, CLAUDE_FIVE_HOUR_MINS);
  const sevenDay = parseWindow(value.seven_day ?? value.sevenDay, CLAUDE_SEVEN_DAY_MINS);
  if (!fiveHour || !sevenDay) {
    return null;
  }
  const sevenDaySonnet = parseWindow(
    value.seven_day_sonnet ?? value.sevenDaySonnet,
    CLAUDE_SEVEN_DAY_MINS,
  );
  return { fiveHour, sevenDay, sevenDaySonnet };
};

const readTokenFromCredentialsFile = async (): Promise<ClaudeOauthCredentialCandidate | null> => {
  const credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json");
  let raw = "";
  try {
    raw = await fs.readFile(credentialsPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return extractOauthCredentialsFromObject(parsed);
};

const readTokenFromMacKeychain = async (): Promise<ClaudeOauthCredentialCandidate | null> => {
  if (process.platform !== "darwin") {
    return null;
  }
  const serviceNames = [
    "Claude Code-credentials",
    "Claude Code Credentials",
    "Claude Code credentials",
    "Claude Code-credentials-production",
  ];
  for (const serviceName of serviceNames) {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-w",
        "-s",
        serviceName,
      ]);
      const credential = extractOauthCredentialsFromSecret(stdout);
      if (credential) {
        return credential;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const resolveClaudeOauthTokenCandidates = async (): Promise<ClaudeOauthCredentialCandidate[]> => {
  const candidatesByAccessToken = new Map<string, ClaudeOauthCredentialCandidate>();
  const pushCandidate = (candidate: ClaudeOauthCredentialCandidate | null) => {
    if (!candidate) {
      return;
    }
    const existing = candidatesByAccessToken.get(candidate.accessToken);
    if (!existing) {
      candidatesByAccessToken.set(candidate.accessToken, candidate);
      return;
    }
    if (existing.refreshToken == null && candidate.refreshToken != null) {
      existing.refreshToken = candidate.refreshToken;
    }
  };

  const envTokenRaw = asNonEmptyString(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  pushCandidate(envTokenRaw ? extractOauthCredentialsFromSecret(envTokenRaw) : null);
  pushCandidate(await readTokenFromMacKeychain());
  pushCandidate(await readTokenFromCredentialsFile());

  return [...candidatesByAccessToken.values()];
};

export const resolveClaudeOauthToken = async (): Promise<string> => {
  const [credential] = await resolveClaudeOauthTokenCandidates();
  if (credential) {
    return credential.accessToken;
  }

  throw new UsageProviderError(
    "TOKEN_NOT_FOUND",
    "Claude token not found. Run claude login or set CLAUDE_CODE_OAUTH_TOKEN.",
  );
};

const parseRefreshResponseAccessToken = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  return asNonEmptyString(value.access_token) ?? asNonEmptyString(value.accessToken);
};

const refreshClaudeOauthAccessToken = async ({
  refreshToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  refreshToken: string;
  timeoutMs?: number;
}): Promise<string> => {
  const clientId =
    asNonEmptyString(process.env.CLAUDE_CODE_OAUTH_CLIENT_ID) ?? CLAUDE_DEFAULT_OAUTH_CLIENT_ID;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
    const response = await fetch(CLAUDE_OAUTH_REFRESH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (response.status === 400 || response.status === 401) {
      throw new UsageProviderError(
        "TOKEN_INVALID",
        "Claude token is invalid or expired. Run claude login again or update CLAUDE_CODE_OAUTH_TOKEN.",
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

    const accessToken = parseRefreshResponseAccessToken(data);
    if (!accessToken) {
      throw new UsageProviderError(
        "UNSUPPORTED_RESPONSE",
        "Claude OAuth token refresh response format is unsupported",
      );
    }

    return accessToken;
  } catch (error) {
    if (error instanceof UsageProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new UsageProviderError("UPSTREAM_UNAVAILABLE", "Claude OAuth token refresh timed out");
    }
    throw new UsageProviderError("UPSTREAM_UNAVAILABLE", "Failed to refresh Claude OAuth token");
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const isTokenInvalidError = (error: unknown): error is UsageProviderError =>
  error instanceof UsageProviderError && error.code === "TOKEN_INVALID";

export const fetchClaudeOauthUsage = async ({
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchClaudeOauthUsageOptions): Promise<ClaudeOauthUsageResponse> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(CLAUDE_USAGE_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": CLAUDE_USAGE_BETA_HEADER,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new UsageProviderError(
        "TOKEN_INVALID",
        "Claude token is invalid or expired. Run claude login again or update CLAUDE_CODE_OAUTH_TOKEN.",
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
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const fetchClaudeOauthUsageWithFallback = async ({
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchClaudeOauthUsageWithFallbackOptions = {}): Promise<ClaudeOauthUsageResponse> => {
  const credentials = await resolveClaudeOauthTokenCandidates();
  if (credentials.length === 0) {
    throw new UsageProviderError(
      "TOKEN_NOT_FOUND",
      "Claude token not found. Run claude login or set CLAUDE_CODE_OAUTH_TOKEN.",
    );
  }

  let lastTokenInvalidError: UsageProviderError | null = null;
  for (const credential of credentials) {
    try {
      return await fetchClaudeOauthUsage({ token: credential.accessToken, timeoutMs });
    } catch (error) {
      if (isTokenInvalidError(error)) {
        lastTokenInvalidError = error;
      } else {
        throw error;
      }

      if (credential.refreshToken == null) {
        continue;
      }

      let refreshedToken = "";
      try {
        refreshedToken = await refreshClaudeOauthAccessToken({
          refreshToken: credential.refreshToken,
          timeoutMs,
        });
      } catch (refreshError) {
        if (isTokenInvalidError(refreshError)) {
          lastTokenInvalidError = refreshError;
          continue;
        }
        throw refreshError;
      }

      try {
        return await fetchClaudeOauthUsage({ token: refreshedToken, timeoutMs });
      } catch (retryError) {
        if (isTokenInvalidError(retryError)) {
          lastTokenInvalidError = retryError;
          continue;
        }
        throw retryError;
      }
    }
  }

  throw (
    lastTokenInvalidError ??
    new UsageProviderError(
      "TOKEN_INVALID",
      "Claude token is invalid or expired. Run claude login again or update CLAUDE_CODE_OAUTH_TOKEN.",
    )
  );
};
