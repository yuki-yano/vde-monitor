import { describe, expect, it, vi } from "vitest";

import { createSseParser } from "./parse-sse-stream";
import type { SseEvent } from "./parse-sse-stream";

// ---------------------------------------------------------------------------
// Helper: collect all events dispatched by the parser
// ---------------------------------------------------------------------------

const collect = () => {
  const events: SseEvent[] = [];
  const parser = createSseParser((e) => {
    events.push(e);
  });
  return { events, parser };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSseParser", () => {
  it("parses a simple event in a single chunk", () => {
    const { events, parser } = collect();
    parser.push("event: sessions\ndata: hello\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: "sessions", data: "hello" });
  });

  it("defaults event type to 'message' when event field is absent", () => {
    const { events, parser } = collect();
    parser.push("data: world\n\n");
    expect(events[0]).toMatchObject({ event: "message", data: "world" });
  });

  it("splits multiple data lines with newline", () => {
    const { events, parser } = collect();
    parser.push("data: line1\ndata: line2\ndata: line3\n\n");
    expect(events[0]?.data).toBe("line1\nline2\nline3");
  });

  it("does not dispatch when data buffer is empty", () => {
    const { events, parser } = collect();
    // Empty line with no preceding data — should not dispatch
    parser.push("\n");
    expect(events).toHaveLength(0);
    // An event field alone (no data) also does not dispatch
    parser.push("event: heartbeat\n\n");
    expect(events).toHaveLength(0);
  });

  it("parses CRLF line endings", () => {
    const { events, parser } = collect();
    parser.push("event: screen\r\ndata: crlf-data\r\n\r\n");
    expect(events[0]).toMatchObject({ event: "screen", data: "crlf-data" });
  });

  it("parses CR-only line endings", () => {
    const { events, parser } = collect();
    parser.push("data: cr\r\r");
    expect(events[0]).toMatchObject({ data: "cr" });
  });

  it("ignores comment lines (starting with ':')", () => {
    const { events, parser } = collect();
    parser.push(": this is a comment\ndata: real\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("real");
  });

  it("strips exactly one leading space from field value", () => {
    const { events, parser } = collect();
    // "data: value" → "value" (one space stripped)
    parser.push("data:  two-spaces\n\n");
    // Only the first space is stripped, so value is " two-spaces"
    expect(events[0]?.data).toBe(" two-spaces");
  });

  it("handles field with no colon (value is empty string)", () => {
    const { events, parser } = collect();
    parser.push("data\ndata\n\n");
    // Two empty data lines → "\n"
    expect(events[0]?.data).toBe("\n");
  });

  it("handles chunk boundary in the middle of a field value", () => {
    const { events, parser } = collect();
    // Split "data: hello\n\n" at an arbitrary position
    parser.push("data: hel");
    parser.push("lo\n\n");
    expect(events[0]?.data).toBe("hello");
  });

  it("handles chunk boundary between the field name and colon", () => {
    const { events, parser } = collect();
    parser.push("dat");
    parser.push("a: chunk-boundary\n\n");
    expect(events[0]?.data).toBe("chunk-boundary");
  });

  it("handles chunk boundary in the middle of the event (between lines)", () => {
    const { events, parser } = collect();
    parser.push("event: sessions\n");
    parser.push("data: payload\n");
    parser.push("\n");
    expect(events[0]).toEqual({ event: "sessions", data: "payload" });
  });

  it("handles chunk boundary exactly at the event separator (empty line)", () => {
    const { events, parser } = collect();
    parser.push("data: split-at-separator\n");
    // The empty-line delimiter is split across two chunks
    parser.push("\n");
    expect(events[0]?.data).toBe("split-at-separator");
  });

  it("parses multiple events from a single push", () => {
    const { events, parser } = collect();
    parser.push("event: a\ndata: first\n\nevent: b\ndata: second\n\n");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: "a", data: "first" });
    expect(events[1]).toMatchObject({ event: "b", data: "second" });
  });

  it("sets id field on dispatched event", () => {
    const { events, parser } = collect();
    parser.push("id: 7\ndata: with-id\n\n");
    expect(events[0]?.id).toBe("7");
  });

  it("carries lastEventId forward to subsequent events that lack an id field", () => {
    const { events, parser } = collect();
    parser.push("id: 100\ndata: first\n\n");
    parser.push("data: second\n\n");
    // The second event should still carry id "100"
    expect(events[1]?.id).toBe("100");
  });

  it("updates lastEventId when a new id field appears", () => {
    const { events, parser } = collect();
    parser.push("id: 1\ndata: a\n\n");
    parser.push("id: 2\ndata: b\n\n");
    expect(events[0]?.id).toBe("1");
    expect(events[1]?.id).toBe("2");
  });

  it("calls onEvent with the callback provided at creation", () => {
    const onEvent = vi.fn();
    const parser = createSseParser(onEvent);
    parser.push("data: test\n\n");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ data: "test" }));
  });
});
