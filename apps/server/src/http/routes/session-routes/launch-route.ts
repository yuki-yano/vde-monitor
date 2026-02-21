import { zValidator } from "@hono/zod-validator";
import type {
  AgentMonitorConfig,
  LaunchCommandResponse,
  LaunchResumeMeta,
  LaunchResumePolicy,
} from "@vde-monitor/shared";
import { Hono } from "hono";
import { z } from "zod";

import { setMapEntryWithLimit } from "../../../cache";
import { toErrorMessage } from "../../../errors";
import { buildError } from "../../helpers";
import type { SessionRouteDeps } from "../types";
import { resolveLaunchResumePlan, resolveRequestedResumePolicy } from "./launch-resume-planner";
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
  resumeSessionId: string | null;
  resumeFromPaneId: string | null;
  effectiveResumePolicy: LaunchResumePolicy | null;
};

export const createLaunchRoute = ({
  config,
  monitor,
  actions,
  sendLimiter,
  getLimiterKey,
}: {
  config: AgentMonitorConfig;
  monitor: SessionRouteDeps["monitor"];
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
    resume: LaunchResumeMeta | null,
  ): LaunchCommandResponse => {
    if (resume) {
      return {
        ok: false,
        error: buildError(errorCode, message),
        rollback: { attempted: false, ok: true },
        resume,
      };
    }
    return {
      ok: false,
      error: buildError(errorCode, message),
      rollback: { attempted: false, ok: true },
    };
  };

  const normalizeResumeText = (value: string | undefined) => {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  };

  const toLaunchIdempotencyPayload = (
    body: LaunchRequestBody,
    effectiveResumePolicy: LaunchResumePolicy | null,
  ): LaunchIdempotencyPayload => ({
    agent: body.agent,
    windowName: body.windowName ?? null,
    cwd: body.cwd ?? null,
    agentOptions: body.agentOptions ?? null,
    worktreePath: body.worktreePath ?? null,
    worktreeBranch: body.worktreeBranch ?? null,
    worktreeCreateIfMissing: body.worktreeCreateIfMissing === true,
    resumeSessionId: normalizeResumeText(body.resumeSessionId),
    resumeFromPaneId: normalizeResumeText(body.resumeFromPaneId),
    effectiveResumePolicy,
  });

  const createUnsupportedResumeMeta = (policy: LaunchResumePolicy | null): LaunchResumeMeta => ({
    requested: true,
    reused: false,
    sessionId: null,
    source: null,
    confidence: "none",
    policy,
    failureReason: "unsupported",
  });

  const createRequestedResumeMeta = (
    policy: LaunchResumePolicy | null,
  ): LaunchResumeMeta | null => {
    if (!policy) {
      return null;
    }
    return {
      requested: true,
      reused: false,
      sessionId: null,
      source: null,
      confidence: "none",
      policy,
    };
  };

  const attachResumeMeta = (
    response: LaunchCommandResponse,
    resume: LaunchResumeMeta | null,
  ): LaunchCommandResponse => {
    if (!resume) {
      return response;
    }
    return { ...response, resume };
  };

  const executeLaunchAgentCommand = async (
    body: LaunchRequestBody,
    limiterKey: string,
  ): Promise<LaunchCommandResponse> => {
    const requestedResumePolicy = resolveRequestedResumePolicy({
      resumePolicy: body.resumePolicy,
      resumeSessionId: body.resumeSessionId,
      resumeFromPaneId: body.resumeFromPaneId,
    });
    const requestedResumeMeta = createRequestedResumeMeta(requestedResumePolicy);

    pruneLaunchIdempotency();
    const cacheKey = `${body.sessionName}:${body.requestId}`;
    const payloadFingerprint = JSON.stringify(
      toLaunchIdempotencyPayload(body, requestedResumePolicy),
    );
    const nowMs = Date.now();
    const cached = launchIdempotency.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
      if (cached.payloadFingerprint !== payloadFingerprint) {
        return launchResponseWithRollback(
          "INVALID_PAYLOAD",
          "requestId payload mismatch",
          requestedResumeMeta,
        );
      }
      if (!cached.settled || cached.wasSuccessful) {
        return cached.promise;
      }
      launchIdempotency.delete(cacheKey);
    } else if (cached) {
      launchIdempotency.delete(cacheKey);
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
      promise: Promise.resolve({
        ok: false as const,
        error: buildError("INTERNAL", "launch command initialization failed"),
        rollback: { attempted: false, ok: true },
      } as LaunchCommandResponse),
    };
    entry.promise = (async (): Promise<LaunchCommandResponse> => {
      let resumeMetaForError = requestedResumeMeta;
      try {
        const resumePlan = await resolveLaunchResumePlan({
          requestAgent: body.agent,
          resumeSessionId: body.resumeSessionId,
          resumeFromPaneId: body.resumeFromPaneId,
          resumePolicy: body.resumePolicy,
          getPaneDetail: (paneId) => monitor.registry.getDetail(paneId),
        });
        resumeMetaForError = resumePlan.meta;

        if (resumePlan.requested && config.multiplexer.backend !== "tmux") {
          return {
            ok: false as const,
            error: buildError("TMUX_UNAVAILABLE", "launch-agent requires tmux backend"),
            rollback: { attempted: false, ok: true },
            resume: createUnsupportedResumeMeta(resumePlan.effectivePolicy),
          };
        }
        if (resumePlan.requested && resumePlan.error) {
          return {
            ok: false as const,
            error: resumePlan.error,
            rollback: { attempted: false, ok: true },
            resume: resumePlan.meta,
          };
        }
        if (!sendLimiter(limiterKey)) {
          return launchResponseWithRollback("RATE_LIMIT", "rate limited", resumePlan.meta);
        }

        const response = await actions.launchAgentInSession({
          sessionName: body.sessionName,
          agent: body.agent,
          windowName: body.windowName,
          cwd: body.cwd,
          agentOptions: body.agentOptions,
          worktreePath: body.worktreePath,
          worktreeBranch: body.worktreeBranch,
          worktreeCreateIfMissing: body.worktreeCreateIfMissing,
          resumeSessionId: resumePlan.resolvedSessionId ?? undefined,
          resumeFromPaneId: body.resumeFromPaneId,
        });
        return attachResumeMeta(response, resumePlan.requested ? resumePlan.meta : null);
      } catch (error) {
        return launchResponseWithRollback(
          "INTERNAL",
          toErrorMessage(error, "launch command failed"),
          resumeMetaForError,
        );
      }
    })().then((response) => {
      entry.settled = true;
      entry.wasSuccessful = response.ok;
      if (!response.ok) {
        launchIdempotency.delete(cacheKey);
      }
      return response;
    });

    setMapEntryWithLimit(launchIdempotency, cacheKey, entry, LAUNCH_IDEMPOTENCY_MAX_ENTRIES);
    return entry.promise;
  };

  return new Hono().post("/sessions/launch", zValidator("json", launchRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const command = await executeLaunchAgentCommand(body, getLimiterKey(c));
    return c.json({ command });
  });
};
