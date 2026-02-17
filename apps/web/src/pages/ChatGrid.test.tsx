// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatGridPage } from "./ChatGrid";

const viewModel = vi.hoisted(() => ({ meta: { connected: true } }));
const viewSpy = vi.fn();
const mockUseChatGridVM = vi.hoisted(() => vi.fn(() => viewModel));
const mockUseMediaQuery = vi.hoisted(() =>
  vi.fn((query: string) => {
    void query;
    return false;
  }),
);

vi.mock("./ChatGrid/useChatGridVM", () => ({
  useChatGridVM: () => mockUseChatGridVM(),
}));

vi.mock("./ChatGrid/ChatGridView", () => ({
  ChatGridView: (props: typeof viewModel) => {
    viewSpy(props);
    return <div data-testid="chat-grid-view">chat-grid</div>;
  },
}));

vi.mock("@/lib/use-media-query", () => ({
  useMediaQuery: mockUseMediaQuery,
}));

describe("ChatGridPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaQuery.mockReturnValue(false);
  });

  it("renders ChatGridView and updates page title", () => {
    render(<ChatGridPage />);

    expect(screen.getByTestId("chat-grid-view")).toBeTruthy();
    expect(mockUseChatGridVM).toHaveBeenCalledTimes(1);
    expect(viewSpy).toHaveBeenCalledWith(viewModel);
    expect(document.title).toBe("Chat Grid - VDE Monitor");
  });

  it("shows fallback message on mobile without mounting desktop view model", () => {
    mockUseMediaQuery.mockReturnValue(true);

    render(<ChatGridPage />);

    expect(screen.getByText("Chat Grid is desktop only")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Live Sessions" })).toBeTruthy();
    expect(mockUseChatGridVM).not.toHaveBeenCalled();
    expect(viewSpy).not.toHaveBeenCalled();
    expect(document.title).toBe("VDE Monitor");
  });
});
