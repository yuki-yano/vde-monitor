import { describe, expect, it } from "vitest";

import { applyAnsiSgrCarryover } from "./ansi-sgr-carryover";

describe("applyAnsiSgrCarryover", () => {
  it("prefixes the carried background to continuation lines", () => {
    const lines = applyAnsiSgrCarryover(["[48;5;237m❯ first[39m", "  second", "[49m"]);
    expect(lines[1]).toBe("[48;5;237m  second");
  });

  it("carries state set on an escape-only line into the next line with content", () => {
    const lines = applyAnsiSgrCarryover(["[48;5;237m", "  second[49m"]);
    expect(lines[0]).toBe("");
    expect(lines[1]).toBe("[48;5;237m  second[49m");
  });

  it("folds a leading reset so cleared attributes are not re-emitted", () => {
    const lines = applyAnsiSgrCarryover(["[48;5;237mfirst", "[49m  output"]);
    expect(lines[1]).toBe("  output");
  });

  it("does not prefix lines without visible content", () => {
    const lines = applyAnsiSgrCarryover(["[48;5;237mfirst", "", "  third"]);
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("[48;5;237m  third");
  });

  it("prefixes whitespace-only lines so painted padding rows keep their background", () => {
    const lines = applyAnsiSgrCarryover(["[48;5;237mfirst", "   [49m"]);
    expect(lines[1]).toBe("[48;5;237m   [49m");
  });

  it("clears all carried state on a full reset", () => {
    const lines = applyAnsiSgrCarryover(["[1m[31m[48;5;237mfirst[0m", "second"]);
    expect(lines[1]).toBe("second");
  });

  it("carries multiple attributes as separate sequences", () => {
    const lines = applyAnsiSgrCarryover(["[1m[38;5;231m[48;2;55;55;55mfirst", "second"]);
    expect(lines[1]).toBe("[1m[38;5;231m[48;2;55;55;55msecond");
  });

  it("clears only the attribute targeted by an off code", () => {
    const lines = applyAnsiSgrCarryover(["[1m[48;5;237mfirst[22m", "second"]);
    expect(lines[1]).toBe("[48;5;237msecond");
  });

  it("keeps basic foreground and background codes", () => {
    const lines = applyAnsiSgrCarryover(["[31m[44mfirst", "second"]);
    expect(lines[1]).toBe("[31m[44msecond");
  });
});
