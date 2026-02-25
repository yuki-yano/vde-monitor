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

type FetchClaudeOauthUsageOptions = {
  token: string;
  timeoutMs?: number;
};

type FetchClaudeOauthUsageWithFallbackOptions = {
  timeoutMs?: number;
};

const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_USAGE_BETA_HEADER = "oauth-2025-04-20";
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

const extractOauthTokenFromObject = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  const candidates = [value.claudeAiOauth, value.oauth, value.auth, value]
    .filter((candidate) => isRecord(candidate))
    .flatMap((candidate) => [
      candidate.accessToken,
      candidate.access_token,
      candidate.token,
      candidate.oauthToken,
    ])
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
  return candidates[0] ?? null;
};

const extractOauthTokenFromSecret = (secret: string): string | null => {
  const normalized = secret.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (!normalized.startsWith("{") && !normalized.startsWith("[")) {
    return normalized;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return normalized;
  }
  return extractOauthTokenFromObject(parsed);
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

const readTokenFromCredentialsFile = async (): Promise<string | null> => {
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
  return extractOauthTokenFromObject(parsed);
};

const readTokenFromMacKeychain = async (): Promise<string | null> => {
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
      const token = extractOauthTokenFromSecret(stdout);
      if (token && token.length > 0) {
        return token;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const resolveClaudeOauthTokenCandidates = async (): Promise<string[]> => {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (token: string | null | undefined) => {
    const normalized = token?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  pushCandidate(await readTokenFromMacKeychain());
  pushCandidate(await readTokenFromCredentialsFile());

  return candidates;
};

export const resolveClaudeOauthToken = async (): Promise<string> => {
  const [token] = await resolveClaudeOauthTokenCandidates();
  if (token) {
    return token;
  }

  throw new UsageProviderError(
    "TOKEN_NOT_FOUND",
    "Claude token not found. Run claude login or set CLAUDE_CODE_OAUTH_TOKEN.",
  );
};

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
  const tokens = await resolveClaudeOauthTokenCandidates();
  if (tokens.length === 0) {
    throw new UsageProviderError(
      "TOKEN_NOT_FOUND",
      "Claude token not found. Run claude login or set CLAUDE_CODE_OAUTH_TOKEN.",
    );
  }

  let lastTokenInvalidError: UsageProviderError | null = null;
  for (const token of tokens) {
    try {
      return await fetchClaudeOauthUsage({ token, timeoutMs });
    } catch (error) {
      if (error instanceof UsageProviderError && error.code === "TOKEN_INVALID") {
        lastTokenInvalidError = error;
        continue;
      }
      throw error;
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
