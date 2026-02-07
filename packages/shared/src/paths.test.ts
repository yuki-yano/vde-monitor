import { describe, expect, it } from "vitest";

import {
  decodePaneId,
  encodePaneId,
  resolveLogPaths,
  resolveServerKey,
  sanitizeServerKey,
} from "./paths";

describe("encode/decode paneId", () => {
  it("encodes and decodes pane IDs safely", () => {
    const original = "%12";
    const encoded = encodePaneId(original);
    expect(encoded).toBe("%2512");
    expect(decodePaneId(encoded)).toBe(original);
  });

  it("round-trips pane IDs with spaces", () => {
    const original = "pane id";
    const encoded = encodePaneId(original);
    expect(decodePaneId(encoded)).toBe(original);
  });

  it("returns raw value when decoding fails", () => {
    const original = "%8";
    expect(decodePaneId(original)).toBe(original);
  });
});

describe("sanitizeServerKey", () => {
  it("replaces slashes with underscores and other symbols with dashes", () => {
    expect(sanitizeServerKey("tmux/socket:name")).toBe("tmux_socket-name");
  });

  it("preserves underscores and dashes", () => {
    expect(sanitizeServerKey("a_b-c")).toBe("a_b-c");
  });
});

describe("resolveServerKey", () => {
  it("prefers socketName over socketPath", () => {
    expect(resolveServerKey("my/socket", "/tmp/tmux.sock")).toBe("my_socket");
  });

  it("falls back to socketPath when socketName is empty", () => {
    expect(resolveServerKey("  ", "/tmp/tmux.sock")).toBe("_tmp_tmux-sock");
  });

  it("returns default when both socketName and socketPath are empty", () => {
    expect(resolveServerKey(" ", " ")).toBe("default");
  });

  it("handles null values", () => {
    expect(resolveServerKey(null, null)).toBe("default");
  });
});

describe("resolveLogPaths", () => {
  it("encodes paneId in log paths", () => {
    const paths = resolveLogPaths("/base", "server", "%1");
    expect(paths.paneIdEncoded).toBe("%251");
    expect(paths.paneLogPath).toBe("/base/panes/server/%251.log");
    expect(paths.eventLogPath).toBe("/base/events/server/claude.jsonl");
  });

  it("handles special pane IDs", () => {
    const paths = resolveLogPaths("/base", "server", "%1/2");
    expect(paths.paneIdEncoded).toBe("%251%2F2");
    expect(paths.paneLogPath).toBe("/base/panes/server/%251%2F2.log");
  });
});
