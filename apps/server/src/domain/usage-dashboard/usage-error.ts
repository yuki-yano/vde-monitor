export const USAGE_PROVIDER_ERROR_CODES = [
  "TOKEN_NOT_FOUND",
  "TOKEN_INVALID",
  "UPSTREAM_UNAVAILABLE",
  "UNSUPPORTED_RESPONSE",
  "INTERNAL",
  "GLOBAL_TIMELINE_UNAVAILABLE",
  "CODEX_APP_SERVER_UNAVAILABLE",
] as const;

export type UsageProviderErrorCode = (typeof USAGE_PROVIDER_ERROR_CODES)[number];

export class UsageProviderError extends Error {
  code: UsageProviderErrorCode;
  severity: "warning" | "error";

  constructor(
    code: UsageProviderErrorCode,
    message: string,
    severity: "warning" | "error" = "error",
  ) {
    super(message);
    this.name = "UsageProviderError";
    this.code = code;
    this.severity = severity;
  }
}
