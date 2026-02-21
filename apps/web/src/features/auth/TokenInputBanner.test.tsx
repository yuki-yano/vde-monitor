import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TokenInputBanner } from "./TokenInputBanner";

describe("TokenInputBanner", () => {
  it("submits trimmed token", () => {
    const onSubmit = vi.fn();
    render(<TokenInputBanner authError={null} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste access token"), {
      target: { value: "  token-123  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    expect(onSubmit).toHaveBeenCalledWith("token-123");
  });

  it("submits when Enter key is pressed", () => {
    const onSubmit = vi.fn();
    render(<TokenInputBanner authError={null} onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("Paste access token");
    fireEvent.change(input, {
      target: { value: "token-enter" },
    });
    fireEvent.submit(input.closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith("token-enter");
  });

  it("shows auth error text when provided", () => {
    render(
      <TokenInputBanner
        authError="Unauthorized. Please refresh with a valid token."
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("Unauthorized. Please refresh with a valid token.")).toBeTruthy();
  });
});
