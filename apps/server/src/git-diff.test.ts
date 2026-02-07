import { describe, expect, it } from "vitest";

import { parseGitStatus } from "./git-diff";

describe("parseGitStatus", () => {
  it("parses basic status entries", () => {
    const output = [" M file.txt", "A  added.md", "?? new.log", ""].join("\0");
    const result = parseGitStatus(output);
    expect(result).toEqual([
      { path: "file.txt", status: "M", staged: false },
      { path: "added.md", status: "A", staged: true },
      { path: "new.log", status: "?", staged: false },
    ]);
  });

  it("parses rename entries", () => {
    const output = ["R  old-name.ts", "new-name.ts", ""].join("\0");
    const result = parseGitStatus(output);
    expect(result).toEqual([
      { path: "new-name.ts", status: "R", staged: true, renamedFrom: "old-name.ts" },
    ]);
  });

  it("skips ignored and malformed entries", () => {
    const output = ["!! ignored.log", "X", " M valid.ts", ""].join("\0");
    const result = parseGitStatus(output);
    expect(result).toEqual([{ path: "valid.ts", status: "M", staged: false }]);
  });

  it("parses copy and unstaged rename entries", () => {
    const output = ["C  source.ts", "copied.ts", " R old.ts", "new.ts", ""].join("\0");
    const result = parseGitStatus(output);
    expect(result).toEqual([
      { path: "copied.ts", status: "C", staged: true, renamedFrom: "source.ts" },
      { path: "new.ts", status: "R", staged: false, renamedFrom: "old.ts" },
    ]);
  });
});
