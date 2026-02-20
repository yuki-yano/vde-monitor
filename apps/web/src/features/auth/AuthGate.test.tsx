import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthGate } from "./AuthGate";

const useSessionsMock = vi.fn();

vi.mock("@/state/session-context", () => ({
  useSessions: () => useSessionsMock(),
}));

describe("AuthGate", () => {
  it("renders children when auth error is absent", () => {
    useSessionsMock.mockReturnValue({
      authError: null,
      setToken: vi.fn(),
      reconnect: vi.fn(),
    });

    render(
      <AuthGate>
        <div>secured-content</div>
      </AuthGate>,
    );

    expect(screen.getByText("secured-content")).toBeTruthy();
  });

  it("renders token banner when auth error is present", () => {
    useSessionsMock.mockReturnValue({
      authError: "Missing token",
      setToken: vi.fn(),
      reconnect: vi.fn(),
    });

    render(
      <AuthGate>
        <div>secured-content</div>
      </AuthGate>,
    );

    expect(screen.queryByText("secured-content")).toBeNull();
    expect(screen.getByText("Authentication required")).toBeTruthy();
  });
});
