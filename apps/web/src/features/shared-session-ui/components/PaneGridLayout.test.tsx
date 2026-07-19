import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaneGridLayout } from "./PaneGridLayout";

const expectClassTokens = (element: HTMLElement, tokens: string[]) => {
  tokens.forEach((token) => {
    expect(element.className).toContain(token);
  });
};

describe("PaneGridLayout", () => {
  it("applies session-list preset classes", () => {
    render(
      <PaneGridLayout responsivePreset="session-list" data-testid="pane-grid-layout">
        <div>item</div>
      </PaneGridLayout>,
    );

    expectClassTokens(screen.getByTestId("pane-grid-layout"), [
      "grid",
      "gap-2.5",
      "sm:gap-4",
      "@lg:grid-cols-2",
      "@3xl:grid-cols-3",
      "@5xl:grid-cols-4",
      "@lg:gap-5",
    ]);
  });

  it("applies chat-grid preset classes", () => {
    render(
      <PaneGridLayout responsivePreset="chat-grid" data-testid="pane-grid-layout">
        <div>item</div>
      </PaneGridLayout>,
    );

    expectClassTokens(screen.getByTestId("pane-grid-layout"), [
      "md:grid-cols-2",
      "xl:grid-cols-3",
      "auto-rows-fr",
    ]);
  });

  it("applies explicit columns, rows and gap classes", () => {
    render(
      <PaneGridLayout columns={2} rows={2} gap="wide" data-testid="pane-grid-layout">
        <div>item</div>
      </PaneGridLayout>,
    );

    expectClassTokens(screen.getByTestId("pane-grid-layout"), [
      "grid-cols-2",
      "grid-rows-2",
      "gap-3",
      "sm:gap-5",
    ]);
  });
});
