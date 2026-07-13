import { describe, expect, it } from "vitest";

import {
  buildSessionGroupLabelByKey,
  buildSessionGroupLabelByName,
  normalizeSessionGroupName,
} from "./session-group-label";

describe("normalizeSessionGroupName", () => {
  it("normalizes empty values to inactive", () => {
    expect(normalizeSessionGroupName("")).toBe("inactive");
    expect(normalizeSessionGroupName("   ")).toBe("inactive");
    expect(normalizeSessionGroupName(null)).toBe("inactive");
    expect(normalizeSessionGroupName(undefined)).toBe("inactive");
  });
});

describe("buildSessionGroupLabelByName", () => {
  it("trims shared prefix and uses the non-overlapping segment as label source", () => {
    const labels = buildSessionGroupLabelByName([
      "repo/feature-login",
      "repo/feature-settings",
      "repo/docs",
    ]);

    expect(labels.get("repo/feature-login")).toBe("LOGI");
    expect(labels.get("repo/feature-settings")).toBe("SETT");
    expect(labels.get("repo/docs")).toBe("DOCS");
  });

  it("does not trim when shared prefix is too short", () => {
    const labels = buildSessionGroupLabelByName(["dev-api", "doc-api"]);

    expect(labels.get("dev-api")).toBe("DEV-");
    expect(labels.get("doc-api")).toBe("DOC-");
  });

  it("removes leading separators after trimming the shared prefix", () => {
    const labels = buildSessionGroupLabelByName(["workspace/main-a", "workspace/main-b"]);

    expect(labels.get("workspace/main-a")).toBe("A");
    expect(labels.get("workspace/main-b")).toBe("B");
  });
});

describe("buildSessionGroupLabelByKey", () => {
  it("distinguishes same-named sessions with short ordinals ordered by stable key", () => {
    const labels = buildSessionGroupLabelByKey([
      { key: "session:workspace-2", name: "same-name" },
      { key: "session:workspace-1", name: "same-name" },
      { key: "session:workspace-2", name: "same-name" },
    ]);

    expect(labels.get("session:workspace-1")).toBe("SAME·1");
    expect(labels.get("session:workspace-2")).toBe("SAME·2");
  });

  it("preserves shared-prefix abbreviations for differently named sessions", () => {
    const labels = buildSessionGroupLabelByKey([
      { key: "session:login", name: "repo/feature-login" },
      { key: "session:settings", name: "repo/feature-settings" },
    ]);

    expect(labels.get("session:login")).toBe("LOGI");
    expect(labels.get("session:settings")).toBe("SETT");
  });
});
