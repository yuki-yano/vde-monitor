import { isIP } from "node:net";

import { ensureConfig } from "../../config";
import { readActiveServerRuntimeEndpoint } from "../../server-runtime-marker";

const TOKEN_ROTATE_REQUEST_TIMEOUT_MS = 1_000;

const resolveRequestHost = (bind: string) => {
  if (isIP(bind) !== 4) {
    throw new Error(`token rotation endpoint must be an IPv4 address. (received: ${bind})`);
  }
  return bind === "0.0.0.0" ? "127.0.0.1" : bind;
};

export const runTokenRotateCommand = async ({
  fetchImpl = fetch,
  host: hostOverride,
  port: portOverride,
  resolveActiveEndpoint = readActiveServerRuntimeEndpoint,
}: {
  fetchImpl?: typeof fetch;
  host?: string;
  port?: number;
  resolveActiveEndpoint?: typeof readActiveServerRuntimeEndpoint;
} = {}) => {
  const config = ensureConfig();
  const activeEndpoint =
    hostOverride != null || portOverride != null
      ? { host: hostOverride ?? config.bind, port: portOverride ?? config.port }
      : await resolveActiveEndpoint();
  const host = resolveRequestHost(activeEndpoint.host);
  const port = activeEndpoint.port;
  const reconcilePersistedRotation = () => {
    const persistedToken = ensureConfig().token;
    if (persistedToken === config.token) return false;
    console.log(persistedToken);
    return true;
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("token rotation request timed out"));
  }, TOKEN_ROTATE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`http://${host}:${port}/api/admin/token/rotate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (reconcilePersistedRotation()) return;
    throw new Error("token rotation requires the active vde-monitor server", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401) {
    if (reconcilePersistedRotation()) return;
    throw new Error(
      "running vde-monitor rejected the persisted token; restart the server to reconcile state, then retry",
    );
  }
  if (!response.ok) {
    if (reconcilePersistedRotation()) return;
    throw new Error(`running vde-monitor failed token rotation (${response.status})`);
  }

  let payload: { token?: unknown; cleanupFailures?: unknown };
  try {
    payload = (await response.json()) as { token?: unknown; cleanupFailures?: unknown };
  } catch (error) {
    if (reconcilePersistedRotation()) return;
    throw new Error("running vde-monitor returned an invalid token rotation response", {
      cause: error,
    });
  }
  if (typeof payload.token !== "string" || payload.token.length === 0) {
    if (reconcilePersistedRotation()) return;
    throw new Error("running vde-monitor returned an invalid token rotation response");
  }
  console.log(payload.token);
  if (Array.isArray(payload.cleanupFailures) && payload.cleanupFailures.length > 0) {
    console.warn(
      `Token rotation committed with incomplete cleanup: ${payload.cleanupFailures.join(", ")}`,
    );
  }
};
