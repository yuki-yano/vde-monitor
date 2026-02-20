import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationPermissionBanner } from "./NotificationPermissionBanner";

describe("NotificationPermissionBanner", () => {
  it("shows enable button when status is idle", () => {
    const onRequestPermission = vi.fn();
    render(
      <NotificationPermissionBanner
        status="idle"
        pushEnabled
        isSubscribed={false}
        paneEnabled={false}
        errorMessage={null}
        onRequestPermission={onRequestPermission}
        onDisable={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(onRequestPermission).toHaveBeenCalled();
  });

  it("shows disabled message when pushEnabled is false", () => {
    render(
      <NotificationPermissionBanner
        status="idle"
        pushEnabled={false}
        isSubscribed={false}
        paneEnabled={false}
        errorMessage={null}
        onRequestPermission={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Push notifications are disabled by server configuration."),
    ).toBeTruthy();
  });

  it("does not show status message while notifications are not enabled", () => {
    render(
      <NotificationPermissionBanner
        status="idle"
        pushEnabled
        isSubscribed={false}
        paneEnabled={false}
        errorMessage={null}
        onRequestPermission={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Enable notifications to receive updates in the background."),
    ).toBeNull();
  });

  it("renders nothing in steady subscribed state", () => {
    const { container } = render(
      <NotificationPermissionBanner
        status="subscribed"
        pushEnabled
        isSubscribed
        paneEnabled
        errorMessage={null}
        onRequestPermission={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("does not show status message when pane notification is disabled", () => {
    render(
      <NotificationPermissionBanner
        status="subscribed"
        pushEnabled
        isSubscribed
        paneEnabled={false}
        errorMessage={null}
        onRequestPermission={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(screen.queryByText("Push notifications are enabled.")).toBeNull();
  });

  it("renders nothing when there is no message and no action", () => {
    const { container } = render(
      <NotificationPermissionBanner
        status="subscribing"
        pushEnabled
        isSubscribed={false}
        paneEnabled={false}
        errorMessage={null}
        onRequestPermission={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
