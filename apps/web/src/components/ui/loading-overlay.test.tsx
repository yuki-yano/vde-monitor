import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingOverlay } from "./loading-overlay";

describe("LoadingOverlay", () => {
  it("shows the loading label immediately or with a delayed entrance", () => {
    const { rerender } = render(<LoadingOverlay label="Loading" />);
    expect(screen.getByText("Loading").parentElement?.className).toContain("animate-fade-in");
    rerender(<LoadingOverlay label="Loading" entrance="delayed" />);
    const className = screen.getByText("Loading").parentElement?.className;
    expect(className).toContain("animate-delayed-fade-in");
    expect(className).not.toContain("animate-fade-in");
  });
});
