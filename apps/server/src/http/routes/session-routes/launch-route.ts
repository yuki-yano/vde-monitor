import { zValidator } from "@hono/zod-validator";
import type { LaunchCommandResponse } from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import { setMapEntryWithLimit } from "../../../cache";
import { toErrorMessage } from "../../../errors";
import { buildError } from "../../helpers";
import type { SessionRouteDeps } from "../types";
import { launchRequestSchema } from "./shared";

const LAUNCH_IDEMPOTENCY_TTL_MS = 60_000;
const LAUNCH_IDEMPOTENCY_MAX_ENTRIES = 500;

type SendLimiter = (key: string) => boolean;
type LaunchRequestBody = z.infer<typeof launchRequestSchema>;
type LaunchIdempotencyPayload = {
  agent: LaunchRequestBody["agent"];
  windowName: string | null;
  cwd: string | null;
  agentOptions: string[] | null;
  worktreePath: string | null;
  worktreeBranch: string | null;
  worktreeCreateIfMissing: boolean;
};

export const createLaunchRoute = ({
  actions,
  sendLimiter,
  getLimiterKey,
}: {
  actions: SessionRouteDeps["actions"];
  sendLimiter: SendLimiter;
  getLimiterKey: SessionRouteDeps["getLimiterKey"];
}) => {
  const launchIdempotency = new Map<
    string,
    {
      expiresAtMs: number;
      payloadFingerprint: string;
      settled: boolean;
      wasSuccessful: boolean;
      promise: Promise<LaunchCommandResponse>;
    }
  >();

  const pruneLaunchIdempotency = () => {
    const nowMs = Date.now();
    for (const [key, value] of launchIdempotency.entries()) {
      if (value.expiresAtMs <= nowMs) {
        launchIdempotency.delete(key);
      }
    }
  };

  const launchResponseWithRollback = (
    errorCode: "INVALID_PAYLOAD" | "RATE_LIMIT" | "INTERNAL",
    message: string,
  ): LaunchCommandResponse => ({
    ok: false,
    error: buildError(errorCode, message),
    rollback: { attempted: false, ok: true },
  });

  const toLaunchIdempotencyPayload = (body: LaunchRequestBody): LaunchIdempotencyPayload => ({
    agent: body.agent,
    windowName: body.windowName ?? null,
    cwd: body.cwd ?? null,
    agentOptions: body.agentOptions ?? null,
    worktreePath: body.worktreePath ?? null,
    worktreeBranch: body.worktreeBranch ?? null,
    worktreeCreateIfMissing: body.worktreeCreateIfMissing === true,
  });

  const executeLaunchAgentCommand = async (
    body: LaunchRequestBody,
    limiterKey: string,
  ): Promise<LaunchCommandResponse> => {
    pruneLaunchIdempotency();
    const cacheKey = `${body.sessionName}:${body.requestId}`;
    const payloadFingerprint = JSON.stringify(toLaunchIdempotencyPayload(body));
    const nowMs = Date.now();
    const cached = launchIdempotency.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
      if (cached.payloadFingerprint !== payloadFingerprint) {
        return launchResponseWithRollback("INVALID_PAYLOAD", "requestId payload mismatch");
      }
      if (!cached.settled || cached.wasSuccessful) {
        return cached.promise;
      }
      launchIdempotency.delete(cacheKey);
    } else if (cached) {
      launchIdempotency.delete(cacheKey);
    }

    if (!sendLimiter(limiterKey)) {
      return launchResponseWithRollback("RATE_LIMIT", "rate limited");
    }

    const entry: {
      expiresAtMs: number;
      payloadFingerprint: string;
      settled: boolean;
      wasSuccessful: boolean;
      promise: Promise<LaunchCommandResponse>;
    } = {
      expiresAtMs: nowMs + LAUNCH_IDEMPOTENCY_TTL_MS,
      payloadFingerprint,
      settled: false,
      wasSuccessful: false,
      promise: actions
        .launchAgentInSession({
          sessionName: body.sessionName,
          agent: body.agent,
          windowName: body.windowName,
          cwd: body.cwd,
          agentOptions: body.agentOptions,
          worktreePath: body.worktreePath,
          worktreeBranch: body.worktreeBranch,
          worktreeCreateIfMissing: body.worktreeCreateIfMissing,
        })
        .then((response) => {
          entry.settled = true;
          entry.wasSuccessful = response.ok;
          if (!response.ok) {
            launchIdempotency.delete(cacheKey);
          }
          return response;
        })
        .catch((error) => {
          launchIdempotency.delete(cacheKey);
          return launchResponseWithRollback(
            "INTERNAL",
            toErrorMessage(error, "launch command failed"),
          );
        }),
    };

    setMapEntryWithLimit(launchIdempotency, cacheKey, entry, LAUNCH_IDEMPOTENCY_MAX_ENTRIES);
    return entry.promise;
  };

  return new Hono().post("/sessions/launch", zValidator("json", launchRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const command = await executeLaunchAgentCommand(body, getLimiterKey(c));
    return c.json({ command });
  });
};
