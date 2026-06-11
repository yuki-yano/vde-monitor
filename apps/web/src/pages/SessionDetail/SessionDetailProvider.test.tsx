import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionDetailProvider } from "./SessionDetailProvider";

describe("SessionDetailProvider", () => {
  it("renders children", () => {
    render(
      <SessionDetailProvider paneId="pane-1">
        <div data-testid="child">child</div>
      </SessionDetailProvider>,
    );

    expect(screen.getByTestId("child").textContent).toBe("child");
  });
});
