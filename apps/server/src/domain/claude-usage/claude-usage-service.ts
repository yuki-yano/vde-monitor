import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

type ClaudeOauthCredential = {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number | null;
  clientId: string | null;
};

type KeychainServiceCandidate = {
  serviceName: string;
  modifiedAtMs: number | null;
};

type KeychainCredentialCandidate = {
  serviceName: string;
  credential: ClaudeOauthCredential;
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
const CLAUDE_CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json");
const CLAUDE_FIVE_HOUR_MINS = 300;
const CLAUDE_SEVEN_DAY_MINS = 10_080;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_DIRECT_OAUTH_TOKEN_LENGTH = 2048;
const CLAUDE_KEYCHAIN_SERVICE_NAMES = [
  "Claude Code-credentials",
  "Claude Code Credentials",
  "Claude Code credentials",
  "Claude Code-credentials-production",
];

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

const asEpochMs = (value: unknown): number | null => {
  const numeric = asNumber(value);
  if (numeric != null) {
    const epochMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return Math.round(epochMs);
  }
  const raw = asNonEmptyString(value);
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

const sliceBalancedJsonObject = (input: string, startBraceIndex: number): string | null => {
  if (input[startBraceIndex] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startBraceIndex; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startBraceIndex, index + 1);
      }
    }
  }
  return null;
};

const trimEdgeControlChars = (raw: string): string => {
  let startIndex = 0;
  let endIndex = raw.length;

  while (startIndex < endIndex && raw.charCodeAt(startIndex) <= 0x1f) {
    startIndex += 1;
  }
  while (endIndex > startIndex && raw.charCodeAt(endIndex - 1) <= 0x1f) {
    endIndex -= 1;
  }

  return raw.slice(startIndex, endIndex);
};

const isWhitespaceOnly = (value: string): boolean => {
  for (const char of value) {
    if (!/\s/.test(char)) {
      return false;
    }
  }
  return true;
};

const extractCredentialFromNamedSegment = (raw: string): ClaudeOauthCredential | null => {
  const candidateKeys = ["claudeAiOauth", "oauth", "auth"];
  for (const key of candidateKeys) {
    const keyTokens = [`"${key}"`, `\\"${key}\\"`];
    for (const keyToken of keyTokens) {
      let searchOffset = 0;
      while (true) {
        const keyIndex = raw.indexOf(keyToken, searchOffset);
        if (keyIndex === -1) {
          break;
        }
        const colonIndex = raw.indexOf(":", keyIndex + keyToken.length);
        if (colonIndex === -1) {
          break;
        }
        const betweenKeyAndColon = raw.slice(keyIndex + keyToken.length, colonIndex);
        if (!isWhitespaceOnly(betweenKeyAndColon)) {
          searchOffset = keyIndex + keyToken.length;
          continue;
        }
        const braceIndex = raw.indexOf("{", colonIndex + 1);
        if (braceIndex === -1) {
          break;
        }
        const betweenColonAndBrace = raw.slice(colonIndex + 1, braceIndex);
        if (!isWhitespaceOnly(betweenColonAndBrace)) {
          searchOffset = keyIndex + keyToken.length;
          continue;
        }
        const objectSlice = sliceBalancedJsonObject(raw, braceIndex);
        if (!objectSlice) {
          searchOffset = keyIndex + keyToken.length;
          continue;
        }
        try {
          const decoded: unknown = JSON.parse(objectSlice);
          const credential = extractCredentialFromObject(decoded);
          if (credential) {
            return credential;
          }
        } catch {
          searchOffset = keyIndex + keyToken.length;
          continue;
        }
        searchOffset = keyIndex + keyToken.length;
      }
    }
  }
  return null;
};

const isHexPayload = (value: string) => value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);

const extractCredentialFromObject = (value: unknown): ClaudeOauthCredential | null => {
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
    const expiresAtMs = asEpochMs(candidate.expiresAt ?? candidate.expires_at);
    const clientId =
      asNonEmptyString(candidate.clientId) ??
      asNonEmptyString(candidate.client_id) ??
      asNonEmptyString(candidate.oauthClientId) ??
      asNonEmptyString(candidate.oauth_client_id);
    return {
      accessToken,
      refreshToken,
      expiresAtMs,
      clientId,
    };
  }
  return null;
};

const extractCredentialFromJsonLikeString = (raw: string): ClaudeOauthCredential | null => {
  const normalized = trimEdgeControlChars(raw.trim());
  if (!normalized) {
    return null;
  }

  try {
    return extractCredentialFromObject(JSON.parse(normalized));
  } catch {
    // Continue to tolerant parse.
  }

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = normalized.slice(firstBrace, lastBrace + 1);
    try {
      return extractCredentialFromObject(JSON.parse(slice));
    } catch {
      // Continue to next parse path.
    }
  }

  if (normalized.startsWith('"') && lastBrace !== -1) {
    const wrapped = `{${normalized.slice(0, lastBrace + 1)}}`;
    try {
      return extractCredentialFromObject(JSON.parse(wrapped));
    } catch {
      // Continue to tolerant parse.
    }
  }

  const fromNamedSegment = extractCredentialFromNamedSegment(normalized);
  if (fromNamedSegment) {
    return fromNamedSegment;
  }

  return null;
};

const extractOauthCredentialsFromSecret = (secret: string): ClaudeOauthCredential | null => {
  const normalized = secret.trim();
  if (!normalized) {
    return null;
  }

  const fromJson = extractCredentialFromJsonLikeString(normalized);
  if (fromJson) {
    return fromJson;
  }

  if (isHexPayload(normalized)) {
    try {
      const decoded = Buffer.from(normalized, "hex").toString("utf8");
      const fromDecoded = extractCredentialFromJsonLikeString(decoded);
      if (fromDecoded) {
        return fromDecoded;
      }
    } catch {
      // Ignore and continue.
    }
  }

  if (normalized.length > MAX_DIRECT_OAUTH_TOKEN_LENGTH) {
    return null;
  }
  return {
    accessToken: normalized,
    refreshToken: null,
    expiresAtMs: null,
    clientId: null,
  };
};

const parseKeychainTimedate = (value: string): number | null => {
  if (!/^\d{14}$/.test(value)) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const isSuffixedClaudeCredentialServiceName = (serviceName: string): boolean =>
  serviceName.startsWith("Claude Code-credentials-");

const parseClaudeCredentialServiceCandidates = (rawDump: string): KeychainServiceCandidate[] => {
  const byServiceName = new Map<string, KeychainServiceCandidate>();
  const blocks = rawDump.split(/class:\s+"genp"/g);
  for (const block of blocks) {
    const serviceMatch = block.match(/"svce"<blob>="([^"]+)"/);
    if (!serviceMatch) {
      continue;
    }
    const serviceName = serviceMatch[1] ?? "";
    if (
      !serviceName.startsWith("Claude Code-credentials") &&
      !serviceName.startsWith("Claude Code Credentials") &&
      !serviceName.startsWith("Claude Code credentials")
    ) {
      continue;
    }

    const modifiedAtMatch = block.match(/"mdat"<timedate>=[^\n]*"(\d{14})Z/);
    const modifiedAtMs = parseKeychainTimedate(modifiedAtMatch?.[1] ?? "");
    const existing = byServiceName.get(serviceName);
    if (!existing || (modifiedAtMs ?? -1) > (existing.modifiedAtMs ?? -1)) {
      byServiceName.set(serviceName, {
        serviceName,
        modifiedAtMs,
      });
    }
  }

  return [...byServiceName.values()].sort((left, right) => {
    const leftSuffixed = isSuffixedClaudeCredentialServiceName(left.serviceName) ? 1 : 0;
    const rightSuffixed = isSuffixedClaudeCredentialServiceName(right.serviceName) ? 1 : 0;
    if (leftSuffixed !== rightSuffixed) {
      return rightSuffixed - leftSuffixed;
    }
    return (
      (right.modifiedAtMs ?? 0) - (left.modifiedAtMs ?? 0) ||
      right.serviceName.localeCompare(left.serviceName)
    );
  });
};

const resolveMacKeychainServiceNames = async (): Promise<string[]> => {
  if (process.platform !== "darwin") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync("security", ["dump-keychain", "login.keychain-db"]);
    const discovered = parseClaudeCredentialServiceCandidates(stdout).map(
      (candidate) => candidate.serviceName,
    );
    return [...new Set([...discovered, ...CLAUDE_KEYCHAIN_SERVICE_NAMES])];
  } catch {
    return CLAUDE_KEYCHAIN_SERVICE_NAMES;
  }
};

const readTokenFromCredentialsFile = async (): Promise<ClaudeOauthCredential | null> => {
  let raw = "";
  try {
    raw = await fs.readFile(CLAUDE_CREDENTIALS_PATH, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return extractCredentialFromObject(parsed);
};

const execFileAsync = (file: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        stdout,
        stderr,
      });
    });
  });

const readCredentialsFromMacKeychain = async (): Promise<KeychainCredentialCandidate[]> => {
  if (process.platform !== "darwin") {
    return [];
  }

  const serviceNames = await resolveMacKeychainServiceNames();
  const candidates: KeychainCredentialCandidate[] = [];
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
        candidates.push({
          serviceName,
          credential,
        });
      }
    } catch {
      continue;
    }
  }

  return candidates;
};

const compareKeychainCredentialCandidates = (
  left: KeychainCredentialCandidate,
  right: KeychainCredentialCandidate,
  nowMs: number,
): number => {
  const leftExpiresAtMs = left.credential.expiresAtMs;
  const rightExpiresAtMs = right.credential.expiresAtMs;
  const leftIsFutureExpiry = leftExpiresAtMs != null && leftExpiresAtMs > nowMs;
  const rightIsFutureExpiry = rightExpiresAtMs != null && rightExpiresAtMs > nowMs;
  if (leftIsFutureExpiry !== rightIsFutureExpiry) {
    return Number(rightIsFutureExpiry) - Number(leftIsFutureExpiry);
  }

  const leftServicePriority = isSuffixedClaudeCredentialServiceName(left.serviceName) ? 1 : 0;
  const rightServicePriority = isSuffixedClaudeCredentialServiceName(right.serviceName) ? 1 : 0;
  if (leftServicePriority !== rightServicePriority) {
    return rightServicePriority - leftServicePriority;
  }

  if (leftExpiresAtMs != null || rightExpiresAtMs != null) {
    return (rightExpiresAtMs ?? 0) - (leftExpiresAtMs ?? 0);
  }
  return 0;
};

const sortKeychainCredentialCandidates = (
  candidates: KeychainCredentialCandidate[],
): KeychainCredentialCandidate[] => {
  const nowMs = Date.now();
  return [...candidates].sort((left, right) =>
    compareKeychainCredentialCandidates(left, right, nowMs),
  );
};

const pickBestKeychainCredential = (
  candidates: KeychainCredentialCandidate[],
): ClaudeOauthCredential | null => {
  if (candidates.length === 0) {
    return null;
  }
  return sortKeychainCredentialCandidates(candidates)[0]?.credential ?? null;
};

const readTokenFromMacKeychain = async (): Promise<ClaudeOauthCredential | null> => {
  const candidates = await readCredentialsFromMacKeychain();
  return pickBestKeychainCredential(candidates);
};

const persistCredentialToCredentialsFile = async (credential: ClaudeOauthCredential) => {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(CLAUDE_CREDENTIALS_PATH, "utf8");
    const decoded: unknown = JSON.parse(raw);
    if (isRecord(decoded)) {
      parsed = { ...decoded };
    }
  } catch {
    // Build from scratch when the file is missing or invalid.
  }

  const nextOauth = isRecord(parsed.claudeAiOauth) ? { ...parsed.claudeAiOauth } : {};
  nextOauth.accessToken = credential.accessToken;
  if (credential.refreshToken != null) {
    nextOauth.refreshToken = credential.refreshToken;
  }
  if (credential.expiresAtMs != null) {
    nextOauth.expiresAt = credential.expiresAtMs;
  }
  if (credential.clientId != null) {
    nextOauth.clientId = credential.clientId;
  }
  parsed.claudeAiOauth = nextOauth;

  await fs.writeFile(CLAUDE_CREDENTIALS_PATH, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
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
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: resolvedClientId,
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
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const resolveClaudeOauthToken = async (): Promise<string> => {
  const fileCredential = await readTokenFromCredentialsFile();
  if (fileCredential) {
    return fileCredential.accessToken;
  }

  const keychainCredential = await readTokenFromMacKeychain();
  if (keychainCredential) {
    await persistCredentialToCredentialsFile(keychainCredential).catch(() => null);
    return keychainCredential.accessToken;
  }

  throw new UsageProviderError("TOKEN_NOT_FOUND", "Claude credential not found. Run claude login.");
};

export const fetchClaudeOauthUsageWithFallback = async ({
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchClaudeOauthUsageWithFallbackOptions = {}): Promise<ClaudeOauthUsageResponse> => {
  const fileCredential = await readTokenFromCredentialsFile();
  let fileError: unknown = null;
  if (fileCredential) {
    try {
      return await fetchClaudeOauthUsage({ token: fileCredential.accessToken, timeoutMs });
    } catch (error) {
      fileError = error;
    }
  }

  const keychainCredentials = await readCredentialsFromMacKeychain();
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
      await persistCredentialToCredentialsFile(keychainCredential).catch(() => null);
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
      await persistCredentialToCredentialsFile({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? keychainCredential.refreshToken,
        expiresAtMs: refreshed.expiresAtMs,
        clientId: keychainCredential.clientId,
      }).catch(() => null);
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
