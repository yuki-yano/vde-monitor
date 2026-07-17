import { AlertTriangle, CheckCircle, Circle, Clock, Loader2, Sparkles, Zap } from "lucide-react";
import { describe, expect, it } from "vitest";

import { agentIconMeta, formatRepoDirLabel, statusIconMeta } from "./quick-panel-utils";

describe("formatRepoDirLabel", () => {
  it("returns No repo for null or empty input", () => {
    expect(formatRepoDirLabel(null)).toBe("No repo");
    expect(formatRepoDirLabel("")).toBe("No repo");
    expect(formatRepoDirLabel("/")).toBe("No repo");
  });

  it("uses the last path segment", () => {
    expect(formatRepoDirLabel("/Users/dev/projects/my-repo")).toBe("my-repo");
    expect(formatRepoDirLabel("/Users/dev/projects/my-repo/")).toBe("my-repo");
  });

  it("returns the value when no separator exists", () => {
    expect(formatRepoDirLabel("repo-name")).toBe("repo-name");
  });
});

describe("statusIconMeta", () => {
  it("maps known states to icons and labels", () => {
    expect(statusIconMeta("WAITING_PERMISSION")).toEqual(
      expect.objectContaining({ icon: AlertTriangle, label: "WAITING_PERMISSION" }),
    );
    expect(statusIconMeta("WAITING_INPUT")).toEqual(
      expect.objectContaining({ icon: Clock, label: "WAITING_INPUT" }),
    );
    expect(statusIconMeta("RUNNING")).toEqual(
      expect.objectContaining({ icon: Loader2, label: "RUNNING" }),
    );
    expect(statusIconMeta("DONE")).toEqual(
      expect.objectContaining({
        icon: CheckCircle,
        className: "text-latte-blue-text",
        wrap: "border-latte-blue/40 bg-latte-blue/15",
        label: "DONE",
      }),
    );
  });

  it("maps UNKNOWN to the neutral state", () => {
    expect(statusIconMeta("UNKNOWN")).toEqual(
      expect.objectContaining({ icon: Circle, label: "UNKNOWN" }),
    );
  });
});

describe("agentIconMeta", () => {
  it("maps agents to icons and labels", () => {
    expect(agentIconMeta("codex")).toEqual(
      expect.objectContaining({ icon: Sparkles, label: "CODEX" }),
    );
    expect(agentIconMeta("claude")).toEqual(
      expect.objectContaining({ icon: Zap, label: "CLAUDE" }),
    );
  });

  it("falls back to unknown agent", () => {
    expect(agentIconMeta("other")).toEqual(
      expect.objectContaining({ icon: Circle, label: "UNKNOWN" }),
    );
  });
});
