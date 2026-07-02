/**
 * Incremental text/event-stream parser.
 *
 * Implements the SSE parsing algorithm from the HTML Living Standard:
 * https://html.spec.whatwg.org/multipage/server-sent-events.html
 *
 * - Multiple `data:` lines are joined with "\n"
 * - Lines starting with ":" are comments and are ignored
 * - Empty line dispatches the current event
 * - CRLF and LF line endings are both supported
 * - chunk boundaries mid-field or mid-event are handled correctly
 */

export type SseEvent = {
  event: string;
  id?: string;
  data: string;
};

export type SseParser = {
  push: (chunk: string) => void;
};

export const createSseParser = (onEvent: (event: SseEvent) => void): SseParser => {
  // Incomplete line carried over from the previous chunk
  let buffer = "";

  // Current event fields being accumulated
  let pendingEvent = "";
  let pendingId: string | undefined;
  let pendingData: string[] = [];

  // The "last event ID buffer" — survives across events and is sent on reconnect
  let lastEventId: string | undefined;

  const dispatch = () => {
    // Per spec: if the data buffer is the empty string, reset and do not dispatch
    if (pendingData.length === 0) {
      pendingEvent = "";
      pendingId = undefined;
      return;
    }

    // Update the last event ID only when an explicit id: field was present
    if (pendingId !== undefined) {
      lastEventId = pendingId;
    }

    onEvent({
      event: pendingEvent || "message",
      ...(lastEventId !== undefined ? { id: lastEventId } : {}),
      data: pendingData.join("\n"),
    });

    pendingEvent = "";
    pendingId = undefined;
    pendingData = [];
  };

  const processLine = (line: string) => {
    // Empty line → dispatch event
    if (line === "") {
      dispatch();
      return;
    }

    // Comment line → ignore
    if (line.startsWith(":")) {
      return;
    }

    const colonIndex = line.indexOf(":");
    let field: string;
    let value: string;

    if (colonIndex === -1) {
      // No colon: entire line is the field name, value is empty string
      field = line;
      value = "";
    } else {
      field = line.slice(0, colonIndex);
      // Remove exactly one leading space from the value if present
      value = line.slice(colonIndex + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
    }

    switch (field) {
      case "event":
        pendingEvent = value;
        break;
      case "id":
        pendingId = value;
        break;
      case "data":
        pendingData.push(value);
        break;
      case "retry":
        // Retry hint is acknowledged but not acted upon here
        break;
      default:
        // Unknown field — ignore per spec
        break;
    }
  };

  return {
    push: (chunk: string) => {
      // Append chunk and split on any line ending (CRLF, CR, LF)
      buffer += chunk;
      const lines = buffer.split(/\r\n|\r|\n/);
      // The last element is an incomplete line (or empty string after a newline)
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line);
      }
    },
  };
};
