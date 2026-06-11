import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { isRecord } from "../parse-utils";
import {
  type ClaudeOauthCredential,
  type KeychainCredentialCandidate,
  extractCredentialFromObject,
  extractOauthCredentialsFromSecret,
  parseClaudeCredentialServiceCandidates,
  pickBestKeychainCredential,
} from "./claude-keychain-parser";

export type { ClaudeOauthCredential, KeychainCredentialCandidate };

export type KeychainReader = {
  readTokenFromCredentialsFile(): Promise<ClaudeOauthCredential | null>;
  readCredentialsFromMacKeychain(): Promise<KeychainCredentialCandidate[]>;
  readTokenFromMacKeychain(): Promise<ClaudeOauthCredential | null>;
  persistCredentialToCredentialsFile(credential: ClaudeOauthCredential): Promise<void>;
};

const CLAUDE_CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json");
const CLAUDE_KEYCHAIN_SERVICE_NAMES = [
  "Claude Code-credentials",
  "Claude Code Credentials",
  "Claude Code credentials",
  "Claude Code-credentials-production",
];

const resolveMacKeychainServiceNames = async (): Promise<string[]> => {
  if (process.platform !== "darwin") {
    return [];
  }

  try {
    const { stdout } = await execa("security", ["dump-keychain", "login.keychain-db"]);
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

const readCredentialsFromMacKeychain = async (): Promise<KeychainCredentialCandidate[]> => {
  if (process.platform !== "darwin") {
    return [];
  }

  const serviceNames = await resolveMacKeychainServiceNames();
  const candidates: KeychainCredentialCandidate[] = [];
  for (const serviceName of serviceNames) {
    try {
      const { stdout } = await execa("security", [
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

export const defaultKeychainReader: KeychainReader = {
  readTokenFromCredentialsFile,
  readCredentialsFromMacKeychain,
  readTokenFromMacKeychain,
  persistCredentialToCredentialsFile: (credential) =>
    persistCredentialToCredentialsFile(credential),
};
