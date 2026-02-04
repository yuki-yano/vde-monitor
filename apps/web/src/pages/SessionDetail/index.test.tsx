// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SessionDetailPage } from "./index";

const viewModel = { meta: { paneId: "pane-1" } };

const providerSpy = vi.fn();
const viewSpy = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ paneId: "pane-1" }),
}));

vi.mock("./SessionDetailProvider", () => ({
  SessionDetailProvider: ({ paneId, children }: { paneId: string; children: ReactNode }) => {
    providerSpy(paneId);
    return (
      <div data-testid="provider" data-paneid={paneId}>
        {children}
      </div>
    );
  },
}));

vi.mock("./useSessionDetailVM", () => ({
  useSessionDetailVM: () => viewModel,
}));

vi.mock("./SessionDetailView", () => ({
  SessionDetailView: (props: typeof viewModel) => {
    viewSpy(props);
    return <div data-testid="view">view</div>;
  },
}));

describe("SessionDetailPage", () => {
  it("wraps view with SessionDetailProvider", () => {
    render(<SessionDetailPage />);

    expect(screen.getByTestId("provider").dataset.paneid).toBe("pane-1");
    expect(screen.getByTestId("view")).toBeTruthy();
    expect(providerSpy).toHaveBeenCalledWith("pane-1");
    expect(viewSpy).toHaveBeenCalledWith(viewModel);
  });
});
