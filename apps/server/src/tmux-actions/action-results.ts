import type { ApiError } from "@vde-monitor/shared";

import { buildError } from "../errors";

export type ActionResult = { ok: true; error?: undefined } | { ok: false; error: ApiError };

export type ActionOutcome<T> = ({ ok: true } & T) | { ok: false; error: ApiError };

export const createActionResultHelpers = () => {
  const okResult = (): ActionResult => ({ ok: true });
  const invalidPayload = (message: string): ActionResult => ({
    ok: false,
    error: buildError("INVALID_PAYLOAD", message),
  });
  const internalError = (message: string): ActionResult => ({
    ok: false,
    error: buildError("INTERNAL", message),
  });
  const dangerousCommand = (): ActionResult => ({
    ok: false,
    error: buildError("DANGEROUS_COMMAND", "dangerous command blocked"),
  });
  const dangerousKey = (): ActionResult => ({
    ok: false,
    error: buildError("DANGEROUS_COMMAND", "dangerous key blocked"),
  });

  return {
    okResult,
    invalidPayload,
    internalError,
    dangerousCommand,
    dangerousKey,
  };
};

export type ActionResultHelpers = ReturnType<typeof createActionResultHelpers>;
