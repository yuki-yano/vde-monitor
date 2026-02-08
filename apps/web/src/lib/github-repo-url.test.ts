import { describe, expect, it } from "vitest";

import { buildGitHubRepoUrl } from "./github-repo-url";

describe("buildGitHubRepoUrl", () => {
  it("returns null for empty values", () => {
    expect(buildGitHubRepoUrl(null)).toBeNull();
    expect(buildGitHubRepoUrl(undefined)).toBeNull();
    expect(buildGitHubRepoUrl("")).toBeNull();
    expect(buildGitHubRepoUrl("   ")).toBeNull();
  });

  it("parses GitHub https remote URLs", () => {
    expect(buildGitHubRepoUrl("https://github.com/foo/bar")).toBe("https://github.com/foo/bar");
    expect(buildGitHubRepoUrl("https://github.com/foo/bar.git")).toBe("https://github.com/foo/bar");
  });

  it("parses GitHub ssh URLs", () => {
    expect(buildGitHubRepoUrl("ssh://git@github.com/foo/bar.git")).toBe(
      "https://github.com/foo/bar",
    );
    expect(buildGitHubRepoUrl("git@github.com:foo/bar.git")).toBe("https://github.com/foo/bar");
  });

  it("parses local clone path under github.com directory", () => {
    expect(buildGitHubRepoUrl("/Users/dev/repos/github.com/foo/bar")).toBe(
      "https://github.com/foo/bar",
    );
    expect(buildGitHubRepoUrl("\\Users\\dev\\repos\\github.com\\foo\\bar")).toBe(
      "https://github.com/foo/bar",
    );
  });

  it("returns null when owner/repo cannot be determined", () => {
    expect(buildGitHubRepoUrl("/Users/dev/workspace/local-repo")).toBeNull();
    expect(buildGitHubRepoUrl("https://example.com/foo/bar")).toBeNull();
    expect(buildGitHubRepoUrl("https://github.com/foo")).toBeNull();
  });
});
