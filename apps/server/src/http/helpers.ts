import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";

export { buildError } from "../errors";
export { nowIso } from "../utils/time";

export const requireAuth = (
  config: AgentMonitorConfig,
  c: { req: { header: (name: string) => string | undefined } },
) => {
  const auth = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return false;
  }
  const token = auth.replace("Bearer ", "").trim();
  return token === config.token;
};

export const isOriginAllowed = (
  config: AgentMonitorConfig,
  origin?: string | null,
  host?: string | null,
) => {
  if (config.allowedOrigins.length === 0) {
    return true;
  }
  if (!origin) {
    return false;
  }
  return (
    config.allowedOrigins.includes(origin) || (host ? config.allowedOrigins.includes(host) : false)
  );
};
