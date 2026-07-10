import { describe, expect, it } from "vitest";

import { resolvePwaTabStateClass } from "./usePwaWorkspaceTabsVM";

describe("resolvePwaTabStateClass", () => {
  it("maps every public session state without an ERROR fallback", () => {
    expect(resolvePwaTabStateClass("RUNNING")).toBe("bg-latte-green/85");
    expect(resolvePwaTabStateClass("WAITING_INPUT")).toBe("bg-latte-peach/85");
    expect(resolvePwaTabStateClass("WAITING_PERMISSION")).toBe("bg-latte-red/85");
    expect(resolvePwaTabStateClass("DONE")).toBe("bg-latte-blue/85");
    expect(resolvePwaTabStateClass("SHELL")).toBe("bg-latte-blue/85");
    expect(resolvePwaTabStateClass("UNKNOWN")).toBe("bg-latte-overlay0/80");
    expect(resolvePwaTabStateClass(null)).toBe("bg-latte-overlay0/80");
  });
});
