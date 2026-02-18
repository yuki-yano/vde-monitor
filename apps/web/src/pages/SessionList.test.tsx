import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionListPage } from "./SessionList";

const viewModel = { meta: { connected: true } };
const viewSpy = vi.fn();

vi.mock("./SessionList/useSessionListVM", () => ({
  useSessionListVM: () => viewModel,
}));

vi.mock("./SessionList/SessionListView", () => ({
  SessionListView: (props: typeof viewModel) => {
    viewSpy(props);
    return <div data-testid="session-list-view">session-list</div>;
  },
}));

describe("SessionListPage", () => {
  it("renders SessionListView and updates page title", () => {
    render(<SessionListPage />);

    expect(screen.getByTestId("session-list-view")).toBeTruthy();
    expect(viewSpy).toHaveBeenCalledWith(viewModel);
    expect(document.title).toBe("VDE Monitor");
  });
});
