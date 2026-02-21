import { describe, expect, it } from "vitest";

import { buildSessionGroupLabelByName, normalizeSessionGroupName } from "./session-group-label";

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
