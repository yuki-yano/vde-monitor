import { describe, expect, it } from "vitest";

import { resolveLaunchResumePlan } from "./launch-resume-planner";

describe("resolveLaunchResumePlan", () => {
  it("returns non-requested plan when resume fields are omitted", async () => {
    const plan = await resolveLaunchResumePlan({
      requestAgent: "codex",
      getPaneDetail: () => null,
    });

    expect(plan).toEqual({
      requested: false,
      effectivePolicy: null,
      resolvedSessionId: null,
      meta: null,
      error: null,
    });
  });

  it("uses manual session id when provided", async () => {
    const plan = await resolveLaunchResumePlan({
      requestAgent: "claude",
      resumeSessionId: "sess-manual",
      getPaneDetail: () => null,
    });

    expect(plan.requested).toBe(true);
    expect(plan.resolvedSessionId).toBe("sess-manual");
    expect(plan.meta?.source).toBe("manual");
    expect(plan.meta?.confidence).toBe("high");
    expect(plan.meta?.policy).toBe("required");
    expect(plan.error).toBeNull();
  });

  it("respects explicitly requested best_effort for manual session id", async () => {
    const plan = await resolveLaunchResumePlan({
      requestAgent: "codex",
      resumeSessionId: "sess-manual",
      resumePolicy: "best_effort",
      getPaneDetail: () => null,
    });

    expect(plan.requested).toBe(true);
    expect(plan.meta?.policy).toBe("best_effort");
    expect(plan.error).toBeNull();
  });
});
