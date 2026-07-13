import { describe, expect, it } from "vitest";

import {
  CMUX_RENDER_GRID_MAX_TAIL_LINES,
  CmuxRenderGridValidationError,
  renderCmuxRenderGridTail,
} from "./render-grid";

const SURFACE_ID = "44444444-4444-4444-8444-444444444444";
const ANSI_RESET = "\u001b[0m";

const makeFrame = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: "cmux.render-grid.v1",
  surface_id: SURFACE_ID,
  state_seq: 1,
  columns: 12,
  rows: 1,
  full: true,
  active_screen: "primary",
  styles: [{ id: 0 }],
  row_spans: [],
  scrollback_rows: 0,
  scrollback_spans: [],
  ...overrides,
});

const render = (frame: unknown, maxLines = 600) =>
  renderCmuxRenderGridTail(frame, { expectedSurfaceId: SURFACE_ID, maxLines });

describe("renderCmuxRenderGridTail", () => {
  it("renders truecolor attributes, column gaps, safe text, and wide cells", () => {
    const result = render(
      makeFrame({
        surface_id: SURFACE_ID.toUpperCase(),
        columns: 12,
        rows: 2,
        active_screen: "alternate",
        styles: [
          { id: 0 },
          {
            id: 7,
            foreground: "#112233",
            background: "445566",
            bold: true,
            faint: true,
            italic: true,
            underline: true,
            blink: true,
            inverse: true,
            invisible: true,
            strikethrough: true,
            overline: true,
          },
        ],
        scrollback_rows: 1,
        scrollback_spans: [{ row: 0, column: 0, style_id: 0, text: "old" }],
        row_spans: [
          {
            row: 0,
            column: 2,
            style_id: 7,
            text: "A\u0000\u001b\u007f\u009bB",
            cell_width: 6,
          },
          { row: 1, column: 0, style_id: 0, text: "界", cell_width: 2 },
        ],
      }),
      10,
    );

    const styledSgr = [
      "\u001b[0m",
      "\u001b[1m",
      "\u001b[2m",
      "\u001b[3m",
      "\u001b[4m",
      "\u001b[5m",
      "\u001b[7m",
      "\u001b[8m",
      "\u001b[9m",
      "\u001b[53m",
      "\u001b[38;2;17;34;51m",
      "\u001b[48;2;68;85;102m",
    ].join("");
    expect(result).toEqual({
      activeScreen: "alternate",
      columns: 12,
      sourceLineCount: 3,
      lines: [
        { plain: "old", styled: `${ANSI_RESET}old${ANSI_RESET}` },
        { plain: "  A    B", styled: `${ANSI_RESET}  ${styledSgr}A    B${ANSI_RESET}` },
        { plain: "界", styled: `${ANSI_RESET}界${ANSI_RESET}` },
      ],
    });
  });

  it("produces stable output across style id reassignment and span fragmentation", () => {
    const whole = render(
      makeFrame({
        columns: 5,
        styles: [{ id: 91, foreground: "#Aa00Ff", bold: true }],
        row_spans: [{ row: 0, column: 0, style_id: 91, text: "hello" }],
      }),
    );
    const fragmented = render(
      makeFrame({
        columns: 5,
        styles: [
          { id: 3, foreground: "AA00FF", bold: true },
          { id: 2, foreground: "#aa00ff", bold: true },
        ],
        row_spans: [
          { row: 0, column: 2, style_id: 3, text: "llo" },
          { row: 0, column: 0, style_id: 2, text: "he" },
        ],
      }),
    );

    expect(fragmented.lines).toEqual(whole.lines);
    expect(whole.lines[0]).toEqual({
      plain: "hello",
      styled: `${ANSI_RESET}\u001b[0m\u001b[1m\u001b[38;2;170;0;255mhello${ANSI_RESET}`,
    });
  });

  it("inherits resolved terminal defaults while preserving meaningful color differences", () => {
    const result = render(
      makeFrame({
        columns: 12,
        rows: 2,
        terminal_foreground: "#000000",
        terminal_background: "#feffff",
        styles: [
          { id: 0, foreground: "#000000", background: "#FEFFFF" },
          { id: 1, foreground: "#ff0000", background: "#feffff" },
          { id: 2, foreground: "#000000", background: "#112233" },
        ],
        row_spans: [
          { row: 0, column: 0, style_id: 0, text: "default" },
          { row: 0, column: 8, style_id: 1, text: "red" },
          { row: 1, column: 0, style_id: 2, text: "panel" },
        ],
      }),
    );

    expect(result.lines).toEqual([
      {
        plain: "default red",
        styled: `${ANSI_RESET}default \u001b[0m\u001b[38;2;255;0;0mred${ANSI_RESET}`,
      },
      {
        plain: "panel",
        styled: `${ANSI_RESET}\u001b[0m\u001b[48;2;17;34;51mpanel${ANSI_RESET}`,
      },
    ]);
  });

  it.each([
    ["Claude Code light", "#000000", "#feffff"],
    ["Claude Code dark", "#cdd6f4", "#1e1e2e"],
  ])(
    "inherits %s terminal colors without discarding accent colors",
    (_mode, foreground, background) => {
      const result = render(
        makeFrame({
          columns: 14,
          terminal_foreground: foreground,
          terminal_background: background,
          styles: [
            { id: 0, foreground, background },
            { id: 1, foreground: "#ff6b80", background },
          ],
          row_spans: [
            { row: 0, column: 0, style_id: 0, text: "default" },
            { row: 0, column: 8, style_id: 1, text: "accent" },
          ],
        }),
      );

      expect(result.lines[0]).toEqual({
        plain: "default accent",
        styled: `${ANSI_RESET}default \u001b[0m\u001b[38;2;255;107;128maccent${ANSI_RESET}`,
      });
    },
  );

  it("returns the final 600 lines from scrollback followed by the viewport", () => {
    const scrollbackSpans = Array.from({ length: 600 }, (_, row) => ({
      row,
      column: 0,
      style_id: 0,
      text: `s${row}`,
    }));
    const frame = makeFrame({
      columns: 8,
      rows: 2,
      scrollback_rows: 600,
      scrollback_spans: scrollbackSpans,
      row_spans: [
        { row: 0, column: 0, style_id: 0, text: "v0" },
        { row: 1, column: 0, style_id: 0, text: "v1" },
      ],
    });

    const capped = render(frame, CMUX_RENDER_GRID_MAX_TAIL_LINES + 100);
    expect(capped.sourceLineCount).toBe(602);
    expect(capped.lines).toHaveLength(600);
    expect(capped.lines[0]?.plain).toBe("s2");
    expect(capped.lines.at(-1)?.plain).toBe("v1");

    expect(render(frame, 2).lines.map((line) => line.plain)).toEqual(["v0", "v1"]);
  });

  it.each([
    ["rejects non-object payloads", null, "render_grid must be an object"],
    [
      "rejects unsupported formats",
      makeFrame({ format: "cmux.render-grid.v2" }),
      "format must be cmux.render-grid.v1",
    ],
    [
      "rejects mismatched surfaces",
      makeFrame({ surface_id: "55555555-5555-4555-8555-555555555555" }),
      "surface_id does not match",
    ],
    ["rejects partial frames", makeFrame({ full: false }), "full must be true"],
    [
      "rejects unknown active screens",
      makeFrame({ active_screen: "secondary" }),
      "active_screen must be either",
    ],
    ["rejects zero columns", makeFrame({ columns: 0 }), "columns must be an integer"],
    ["rejects excessive columns", makeFrame({ columns: 601 }), "columns must be an integer"],
    ["rejects zero rows", makeFrame({ rows: 0 }), "rows must be an integer"],
    ["rejects excessive rows", makeFrame({ rows: 601 }), "rows must be an integer"],
    [
      "rejects excessive scrollback",
      makeFrame({ scrollback_rows: 601 }),
      "scrollback_rows must be an integer",
    ],
  ])("%s", (_name, frame, message) => {
    expect(() => render(frame)).toThrow(message as string);
  });

  it.each([
    [
      "rejects duplicate style ids",
      makeFrame({ styles: [{ id: 0 }, { id: 0 }] }),
      "duplicates style id 0",
    ],
    [
      "rejects malformed foreground colors",
      makeFrame({ styles: [{ id: 0, foreground: "#12345g" }] }),
      "foreground must be a 6-digit hex color",
    ],
    [
      "rejects malformed background colors",
      makeFrame({ styles: [{ id: 0, background: 123456 }] }),
      "background must be a string",
    ],
    [
      "rejects non-boolean attributes",
      makeFrame({ styles: [{ id: 0, bold: 1 }] }),
      "bold must be a boolean",
    ],
    [
      "rejects unknown span styles",
      makeFrame({ row_spans: [{ row: 0, column: 0, style_id: 9, text: "x" }] }),
      "references unknown style id 9",
    ],
  ])("%s", (_name, frame, message) => {
    expect(() => render(frame)).toThrow(message as string);
  });

  it.each([
    [
      "rejects out-of-range viewport rows",
      makeFrame({ row_spans: [{ row: 1, column: 0, style_id: 0, text: "x" }] }),
      "row_spans[0].row must be an integer",
    ],
    [
      "rejects out-of-range scrollback rows",
      makeFrame({
        scrollback_rows: 1,
        scrollback_spans: [{ row: 1, column: 0, style_id: 0, text: "x" }],
      }),
      "scrollback_spans[0].row must be an integer",
    ],
    [
      "rejects out-of-range columns",
      makeFrame({ row_spans: [{ row: 0, column: 12, style_id: 0, text: "x" }] }),
      "row_spans[0].column must be an integer",
    ],
    [
      "rejects spans wider than the grid",
      makeFrame({
        row_spans: [{ row: 0, column: 11, style_id: 0, text: "x", cell_width: 2 }],
      }),
      "exceeds the 12-column grid",
    ],
    [
      "rejects text wider than its cell width",
      makeFrame({
        row_spans: [{ row: 0, column: 0, style_id: 0, text: "xx", cell_width: 1 }],
      }),
      "text exceeds cell_width",
    ],
    [
      "rejects empty zero-width spans",
      makeFrame({ row_spans: [{ row: 0, column: 0, style_id: 0, text: "" }] }),
      "must occupy at least one cell",
    ],
    [
      "rejects overlapping spans",
      makeFrame({
        row_spans: [
          { row: 0, column: 0, style_id: 0, text: "abc" },
          { row: 0, column: 2, style_id: 0, text: "x" },
        ],
      }),
      "overlaps a previous span",
    ],
  ])("%s", (_name, frame, message) => {
    expect(() => render(frame)).toThrow(message as string);
  });

  it("rejects style collections above the total limit", () => {
    const styles = Array.from({ length: 4_097 }, (_, id) => ({ id }));
    expect(() => render(makeFrame({ styles }))).toThrow("styles exceeds the limit of 4096");
  });

  it("rejects span collections above the total limit", () => {
    const span = { row: 0, column: 0, style_id: 0, text: "x" };
    expect(() => render(makeFrame({ row_spans: Array(200_001).fill(span) }))).toThrow(
      "spans exceeds the total limit of 200000",
    );
  });

  it("rejects span text above the total byte limit", () => {
    const oversizedText = "x".repeat(4 * 1024 * 1024 + 1);
    expect(() =>
      render(makeFrame({ row_spans: [{ row: 0, column: 0, style_id: 0, text: oversizedText }] })),
    ).toThrow("span text exceeds the total limit of 4194304 bytes");
  });

  it("rejects invalid output line limits", () => {
    expect(() => render(makeFrame(), 0)).toThrow("maxLines must be a positive integer");
  });

  it("exposes a dedicated validation error type", () => {
    expect(() => render(makeFrame({ format: null }))).toThrow(CmuxRenderGridValidationError);
  });
});
