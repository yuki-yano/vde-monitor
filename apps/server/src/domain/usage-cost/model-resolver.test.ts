import { describe, expect, it } from "vitest";

import { resolveModelId } from "./model-resolver";

describe("resolveModelId", () => {
  it("resolves exact model id", () => {
    const result = resolveModelId({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      availableModelIds: ["gpt-5.3-codex"],
    });
    expect(result).toEqual({
      resolvedModelId: "gpt-5.3-codex",
      strategy: "exact",
    });
  });

  it("resolves prefix model id", () => {
    const result = resolveModelId({
      providerId: "codex",
      modelId: "gpt-5.3-codex",
      availableModelIds: ["github_copilot/gpt-5.3-codex"],
    });
    expect(result).toEqual({
      resolvedModelId: "github_copilot/gpt-5.3-codex",
      strategy: "prefix",
    });
  });

  it("resolves provider alias", () => {
    const result = resolveModelId({
      providerId: "claude",
      modelId: "haiku",
      availableModelIds: ["claude-haiku-4-5-20251001"],
    });
    expect(result).toEqual({
      resolvedModelId: "claude-haiku-4-5-20251001",
      strategy: "alias",
    });
  });

  it("rejects excluded model id", () => {
    const result = resolveModelId({
      providerId: "claude",
      modelId: "<synthetic>",
      availableModelIds: ["<synthetic>"],
    });
    expect(result).toEqual({
      resolvedModelId: null,
      strategy: "none",
    });
  });
});
