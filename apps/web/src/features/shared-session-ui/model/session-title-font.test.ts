import { describe, expect, it } from "vitest";

import {
  resolveSessionCardTitleTextClass,
  resolveSessionDetailTitleTextClass,
  resolveSessionSidebarTitleTextClass,
} from "./session-title-font";

describe("session title font helpers", () => {
  it("returns larger classes for short titles", () => {
    expect(resolveSessionCardTitleTextClass("short title")).toBe("text-[15px]");
    expect(resolveSessionDetailTitleTextClass("short title")).toBe("!text-xl");
    expect(resolveSessionSidebarTitleTextClass("short title")).toBe("text-sm");
  });

  it("returns compact classes for long latin titles", () => {
    const longTitle = "very-long-title-for-session-card-and-detail-header";
    expect(resolveSessionCardTitleTextClass(longTitle)).toBe("text-[12px]");
    expect(resolveSessionDetailTitleTextClass(longTitle.repeat(2))).toBe("!text-xs");
    expect(resolveSessionSidebarTitleTextClass(longTitle)).toBe("text-[11px]");
  });

  it("treats wide characters as longer visual width", () => {
    const japaneseTitle = "要約結果を日本語でわかりやすく表示するセッションタイトル";
    expect(resolveSessionCardTitleTextClass(japaneseTitle)).toBe("text-[12px]");
    expect(resolveSessionSidebarTitleTextClass(japaneseTitle)).toBe("text-[10px]");
  });

  it("uses minimum classes for very long titles", () => {
    const extreme = "extremely-long-title-".repeat(6);
    expect(resolveSessionCardTitleTextClass(extreme)).toBe("text-[11px]");
    expect(resolveSessionDetailTitleTextClass(extreme)).toBe("!text-xs");
    expect(resolveSessionSidebarTitleTextClass(extreme)).toBe("text-[10px]");
  });
});
