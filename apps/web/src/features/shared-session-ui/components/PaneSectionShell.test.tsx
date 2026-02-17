import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaneSectionShell } from "./PaneSectionShell";

describe("PaneSectionShell", () => {
  it("renders title, description, action, status, and children", () => {
    render(
      <PaneSectionShell
        title="Section"
        description="Summary"
        action={<button type="button">Refresh</button>}
        status={<p>Status line</p>}
        headerTestId="pane-section-header"
      >
        <div>Body content</div>
      </PaneSectionShell>,
    );

    expect(screen.getByText("Section")).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByText("Status line")).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();
    expect(screen.getByTestId("pane-section-header").className).toContain("items-start");
  });
});
