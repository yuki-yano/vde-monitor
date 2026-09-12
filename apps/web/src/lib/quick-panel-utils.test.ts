import { Circle } from "lucide-react";
import { describe, expect, it } from "vitest";

import { agentIconMeta } from "./quick-panel-utils";

describe("agentIconMeta", () => {
  it("falls back to unknown agent", () => {
    expect(agentIconMeta("other")).toEqual(
      expect.objectContaining({ icon: Circle, label: "UNKNOWN" }),
    );
  });
});
