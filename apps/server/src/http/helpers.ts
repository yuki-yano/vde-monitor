import type { AgentMonitorConfig, ApiError } from "@vde-monitor/shared";

export const nowIso = () => new Date().toISOString();

export const buildError = (code: ApiError["code"], message: string): ApiError => ({
  code,
  message,
});

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
