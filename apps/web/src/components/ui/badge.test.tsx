import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("animates the running icon unless disabled", () => {
    const { container, rerender } = render(<Badge tone="running">running</Badge>);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
    rerender(
      <Badge tone="running" animateIcon={false}>
        running
      </Badge>,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin");
  });
});
