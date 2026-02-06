// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("keeps running icon animated by default", () => {
    const { container } = render(<Badge tone="running">running</Badge>);
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("animate-spin");
  });

  it("stops running icon animation when animateIcon is false", () => {
    const { container } = render(
      <Badge tone="running" animateIcon={false}>
        running
      </Badge>,
    );
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").not.toContain("animate-spin");
  });
});
