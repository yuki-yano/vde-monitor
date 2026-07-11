import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderQuotaSection } from "./ProviderQuotaSection";

describe("ProviderQuotaSection", () => {
  it("separates its loading announcement from the busy visual region", () => {
    render(
      <ProviderQuotaSection
        title="Codex"
        provider={null}
        nowMs={0}
        providerLoading
        billingLoading={false}
      />,
    );

    const status = screen.getByRole("status", { name: "Loading Codex usage data" });
    const content = screen.getByTestId("provider-quota-codex");
    expect(content.getAttribute("aria-busy")).toBe("true");
    expect(content.contains(status)).toBe(false);
    expect(content.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
