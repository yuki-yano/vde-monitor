import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("keeps decorative semantics while forwarding styling and HTML attributes", () => {
    render(
      <Skeleton
        data-testid="skeleton"
        aria-hidden={false}
        className="h-4 w-20 rounded-xl"
        title="Loading shape"
      />,
    );

    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.getAttribute("title")).toBe("Loading shape");
    expect(skeleton.className).toContain("vde-skeleton");
    expect(skeleton.className).toContain("h-4");
    expect(skeleton.className).toContain("w-20");
    expect(skeleton.className).toContain("rounded-xl");
  });
});
