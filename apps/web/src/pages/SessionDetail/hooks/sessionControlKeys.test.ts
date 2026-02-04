import { describe, expect, it } from "vitest";

import { mapKeyWithModifiers } from "./sessionControlKeys";

describe("mapKeyWithModifiers", () => {
  it("maps shift+Tab to BTab", () => {
    expect(mapKeyWithModifiers("Tab", false, true)).toBe("BTab");
  });

  it("maps ctrl+Left to C-Left", () => {
    expect(mapKeyWithModifiers("Left", true, false)).toBe("C-Left");
  });

  it("returns original key without modifiers", () => {
    expect(mapKeyWithModifiers("Enter", false, false)).toBe("Enter");
  });
});
