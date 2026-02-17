import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorktreeStatusStack } from "./WorktreeStatusStack";

describe("WorktreeStatusStack", () => {
  it("shows loading message when loading without entries", () => {
    render(<WorktreeStatusStack loading error={null} entriesCount={0} />);

    expect(screen.getByText("Loading worktrees...")).toBeTruthy();
  });

  it("shows error message when error exists", () => {
    render(<WorktreeStatusStack loading={false} error="Failed" entriesCount={0} />);

    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("shows empty message when no entries and no loading/error", () => {
    render(<WorktreeStatusStack loading={false} error={null} entriesCount={0} />);

    expect(screen.getByText("No worktrees available.")).toBeTruthy();
  });

  it("renders nothing when entries are present", () => {
    const { container } = render(
      <WorktreeStatusStack loading={false} error={null} entriesCount={2} />,
    );

    expect(container.textContent).toBe("");
  });
});
