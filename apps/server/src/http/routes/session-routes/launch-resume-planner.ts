import type {
  ApiErrorCode,
  LaunchResumeMeta,
  LaunchResumePolicy,
  SessionDetail,
} from "@vde-monitor/shared";

import { buildError } from "../../../errors";
import { resolveSessionByPane } from "../../../tmux-actions/session-resume-resolver";

type ResumeFailureReason = NonNullable<LaunchResumeMeta["failureReason"]>;

const resolveResumeErrorCode = (reason: ResumeFailureReason): ApiErrorCode => {
  switch (reason) {
    case "not_found":
      return "RESUME_NOT_FOUND";
    case "ambiguous":
      return "RESUME_AMBIGUOUS";
    case "unsupported":
      return "RESUME_UNSUPPORTED";
    case "invalid_input":
      return "RESUME_INVALID_INPUT";
  }
};

const buildFallbackMeta = ({
  policy,
  reason,
}: {
  policy: LaunchResumePolicy;
  reason: ResumeFailureReason;
}): LaunchResumeMeta => ({
  requested: true,
  reused: false,
  sessionId: null,
  source: null,
  confidence: "none",
  policy,
  fallbackReason: reason,
});

const buildFailureMeta = ({
  policy,
  reason,
}: {
  policy: LaunchResumePolicy;
  reason: ResumeFailureReason;
}): LaunchResumeMeta => ({
  requested: true,
  reused: false,
  sessionId: null,
  source: null,
  confidence: "none",
  policy,
  failureReason: reason,
});

const resolveManualSession = (resumeSessionId: string | undefined) => {
  const normalized = resumeSessionId?.trim();
  if (!normalized) {
    return { ok: false as const, reason: "invalid_input" as const };
  }
  return {
    ok: true as const,
    sessionId: normalized,
    meta: {
      requested: true,
      reused: true,
      sessionId: normalized,
      source: "manual" as const,
      confidence: "high" as const,
    },
  };
};

const resolvePaneSession = async ({
  resumeFromPaneId,
  requestAgent,
  getPaneDetail,
}: {
  resumeFromPaneId: string | undefined;
  requestAgent: "codex" | "claude";
  getPaneDetail: (paneId: string) => SessionDetail | null;
}) => {
  const normalizedPaneId = resumeFromPaneId?.trim();
  if (!normalizedPaneId) {
    return { ok: false as const, reason: "invalid_input" as const };
  }
  const pane = getPaneDetail(normalizedPaneId);
  if (!pane) {
    return { ok: false as const, reason: "invalid_input" as const };
  }
  const resolved = await resolveSessionByPane({ pane, requestAgent });
  if (!resolved.ok) {
    return { ok: false as const, reason: resolved.reason };
  }
  return {
    ok: true as const,
    sessionId: resolved.sessionId,
    meta: {
      requested: true,
      reused: true,
      sessionId: resolved.sessionId,
      source: resolved.source,
      confidence: resolved.confidence,
    },
  };
};

type LaunchResumePlan =
  | {
      requested: false;
      effectivePolicy: null;
      resolvedSessionId: null;
      meta: null;
      error: null;
    }
  | {
      requested: true;
      effectivePolicy: LaunchResumePolicy;
      resolvedSessionId: string | null;
      meta: LaunchResumeMeta;
      error: null | ReturnType<typeof buildError>;
    };

export const resolveRequestedResumePolicy = ({
  resumePolicy,
  resumeSessionId,
  resumeFromPaneId,
}: {
  resumePolicy?: LaunchResumePolicy;
  resumeSessionId?: string;
  resumeFromPaneId?: string;
}): LaunchResumePolicy | null => {
  const hasManual = Boolean(resumeSessionId?.trim());
  const hasPane = Boolean(resumeFromPaneId?.trim());
  if (!hasManual && !hasPane) {
    return null;
  }
  if (resumePolicy) {
    return resumePolicy;
  }
  if (hasManual) {
    return "required";
  }
  return "best_effort";
};

export const resolveLaunchResumePlan = async ({
  requestAgent,
  resumeSessionId,
  resumeFromPaneId,
  resumePolicy,
  getPaneDetail,
}: {
  requestAgent: "codex" | "claude";
  resumeSessionId?: string;
  resumeFromPaneId?: string;
  resumePolicy?: LaunchResumePolicy;
  getPaneDetail: (paneId: string) => SessionDetail | null;
}): Promise<LaunchResumePlan> => {
  const effectivePolicy = resolveRequestedResumePolicy({
    resumePolicy,
    resumeSessionId,
    resumeFromPaneId,
  });
  if (!effectivePolicy) {
    return {
      requested: false,
      effectivePolicy: null,
      resolvedSessionId: null,
      meta: null,
      error: null,
    };
  }

  const hasManual = Boolean(resumeSessionId?.trim());
  const hasPane = Boolean(resumeFromPaneId?.trim());
  const manualResult = hasManual ? resolveManualSession(resumeSessionId) : null;
  if (manualResult?.ok) {
    return {
      requested: true,
      effectivePolicy,
      resolvedSessionId: manualResult.sessionId,
      meta: {
        ...manualResult.meta,
        policy: effectivePolicy,
      },
      error: null,
    };
  }

  if (manualResult && !manualResult.ok && effectivePolicy === "required") {
    return {
      requested: true,
      effectivePolicy,
      resolvedSessionId: null,
      meta: buildFailureMeta({ policy: effectivePolicy, reason: manualResult.reason }),
      error: buildError(
        resolveResumeErrorCode(manualResult.reason),
        "failed to resolve resume session",
      ),
    };
  }

  // In best_effort mode, an empty/invalid manual id should fall through to pane-based resolution.
  if (hasPane) {
    const paneResult = await resolvePaneSession({
      resumeFromPaneId,
      requestAgent,
      getPaneDetail,
    });
    if (paneResult.ok) {
      return {
        requested: true,
        effectivePolicy,
        resolvedSessionId: paneResult.sessionId,
        meta: {
          ...paneResult.meta,
          policy: effectivePolicy,
        },
        error: null,
      };
    }
    if (effectivePolicy === "required") {
      return {
        requested: true,
        effectivePolicy,
        resolvedSessionId: null,
        meta: buildFailureMeta({ policy: effectivePolicy, reason: paneResult.reason }),
        error: buildError(
          resolveResumeErrorCode(paneResult.reason),
          "failed to resolve resume session from pane",
        ),
      };
    }
    return {
      requested: true,
      effectivePolicy,
      resolvedSessionId: null,
      meta: buildFallbackMeta({ policy: effectivePolicy, reason: paneResult.reason }),
      error: null,
    };
  }

  const fallbackReason: ResumeFailureReason = manualResult?.reason ?? "not_found";
  if (effectivePolicy === "required") {
    return {
      requested: true,
      effectivePolicy,
      resolvedSessionId: null,
      meta: buildFailureMeta({ policy: effectivePolicy, reason: fallbackReason }),
      error: buildError(resolveResumeErrorCode(fallbackReason), "failed to resolve resume session"),
    };
  }
  return {
    requested: true,
    effectivePolicy,
    resolvedSessionId: null,
    meta: buildFallbackMeta({ policy: effectivePolicy, reason: fallbackReason }),
    error: null,
  };
};
