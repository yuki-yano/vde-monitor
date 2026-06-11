import type { ApiErrorCode } from "@vde-monitor/shared";

export const isUnavailableError = (message: string) =>
  /no running wezterm|failed to connect|cannot connect|unable to connect|ENOENT|spawn .* ENOENT/i.test(
    message,
  );

export const isPaneNotFoundError = (message: string) =>
  /pane .*not found|no such pane|invalid pane/i.test(message);

export const resolveWeztermErrorCode = (message: string): ApiErrorCode => {
  if (isUnavailableError(message)) {
    return "WEZTERM_UNAVAILABLE";
  }
  if (isPaneNotFoundError(message)) {
    return "INVALID_PANE";
  }
  return "INTERNAL";
};
