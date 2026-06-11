import { asNonEmptyString, asNumber, isRecord } from "../parse-utils";

export type ClaudeOauthCredential = {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number | null;
  clientId: string | null;
};

export type KeychainServiceCandidate = {
  serviceName: string;
  modifiedAtMs: number | null;
};

export type KeychainCredentialCandidate = {
  serviceName: string;
  credential: ClaudeOauthCredential;
};

const MAX_DIRECT_OAUTH_TOKEN_LENGTH = 2048;

export const asEpochMs = (value: unknown): number | null => {
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

// Best-effort fallback parser for keychain dump blobs.
// This intentionally does not implement full JSON grammar and should only be used as a recovery path.
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

export const extractCredentialFromObject = (value: unknown): ClaudeOauthCredential | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const credential = extractCredentialFromObject(item);
      if (credential) {
        return credential;
      }
    }
    return null;
  }
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

export const extractOauthCredentialsFromSecret = (secret: string): ClaudeOauthCredential | null => {
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

export const isSuffixedClaudeCredentialServiceName = (serviceName: string): boolean =>
  serviceName.startsWith("Claude Code-credentials-");

export const parseClaudeCredentialServiceCandidates = (
  rawDump: string,
): KeychainServiceCandidate[] => {
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

export const sortKeychainCredentialCandidates = (
  candidates: KeychainCredentialCandidate[],
): KeychainCredentialCandidate[] => {
  const nowMs = Date.now();
  return [...candidates].sort((left, right) =>
    compareKeychainCredentialCandidates(left, right, nowMs),
  );
};

export const pickBestKeychainCredential = (
  candidates: KeychainCredentialCandidate[],
): ClaudeOauthCredential | null => {
  if (candidates.length === 0) {
    return null;
  }
  return sortKeychainCredentialCandidates(candidates)[0]?.credential ?? null;
};
