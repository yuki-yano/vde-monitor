import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("keeps decorative semantics while forwarding HTML attributes", () => {
    render(<Skeleton data-testid="skeleton" aria-hidden={false} title="Loading shape" />);

    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.getAttribute("title")).toBe("Loading shape");
  });
});
