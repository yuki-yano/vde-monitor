const ANSI_RESET = "\u001b[0m";
const CMUX_RENDER_GRID_FORMAT = "cmux.render-grid.v1";
const MAX_DIMENSION = 600;
const MAX_SCROLLBACK_ROWS = 600;
const MAX_STYLES = 4_096;
const MAX_TOTAL_SPANS = 200_000;
const MAX_TOTAL_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_STYLE_ID = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UTF8_ENCODER = new TextEncoder();
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const CMUX_RENDER_GRID_MAX_TAIL_LINES = 600;

export type CmuxRenderGridScreen = "primary" | "alternate";

export type CmuxRenderGridLine = {
  plain: string;
  styled: string;
};

export type CmuxRenderGridTail = {
  activeScreen: CmuxRenderGridScreen;
  columns: number;
  sourceLineCount: number;
  lines: CmuxRenderGridLine[];
};

export type CmuxRenderGridOptions = {
  expectedSurfaceId: string;
  maxLines?: number;
};

export class CmuxRenderGridValidationError extends Error {
  override readonly name = "CmuxRenderGridValidationError";

  constructor(message: string) {
    super(`invalid cmux render grid: ${message}`);
  }
}

type Rgb = readonly [red: number, green: number, blue: number];

type DefaultColors = {
  background: Rgb | null;
  foreground: Rgb | null;
};

type ResolvedStyle = {
  signature: string;
  sgr: string;
};

type ValidatedSpan = {
  column: number;
  path: string;
  row: number;
  style: ResolvedStyle;
  text: string;
  width: number;
};

type StyledRun = {
  style: ResolvedStyle;
  text: string;
};

const fail = (message: string): never => {
  throw new CmuxRenderGridValidationError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) return fail(`${path} must be an object`);
  return value;
};

const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) return fail(`${path} must be an array`);
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== "string") return fail(`${path} must be a string`);
  return value;
};

const requireBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean") return fail(`${path} must be a boolean`);
  return value;
};

const requireInteger = (
  value: unknown,
  path: string,
  { min, max }: { min: number; max: number },
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${path} must be an integer between ${min} and ${max}`);
  }
  return value as number;
};

const optionalBoolean = (record: Record<string, unknown>, key: string, path: string): boolean => {
  const value = record[key];
  if (value == null) return false;
  return requireBoolean(value, `${path}.${key}`);
};

const parseColor = (value: unknown, path: string): Rgb | null => {
  if (value == null) return null;
  const raw = requireString(value, path);
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-f]{6}$/i.test(hex)) fail(`${path} must be a 6-digit hex color`);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

const colorCode = (prefix: 38 | 48, color: Rgb): string =>
  `${prefix};2;${color[0]};${color[1]};${color[2]}`;

const colorsEqual = (left: Rgb | null, right: Rgb | null): boolean =>
  left != null &&
  right != null &&
  left[0] === right[0] &&
  left[1] === right[1] &&
  left[2] === right[2];

const resolveStyle = (
  record: Record<string, unknown>,
  path: string,
  defaultColors: DefaultColors,
): ResolvedStyle => {
  const codes = ["0"];
  if (optionalBoolean(record, "bold", path)) codes.push("1");
  if (optionalBoolean(record, "faint", path)) codes.push("2");
  if (optionalBoolean(record, "italic", path)) codes.push("3");
  if (optionalBoolean(record, "underline", path)) codes.push("4");
  if (optionalBoolean(record, "blink", path)) codes.push("5");
  if (optionalBoolean(record, "inverse", path)) codes.push("7");
  if (optionalBoolean(record, "invisible", path)) codes.push("8");
  if (optionalBoolean(record, "strikethrough", path)) codes.push("9");
  if (optionalBoolean(record, "overline", path)) codes.push("53");

  const foreground = parseColor(record.foreground, `${path}.foreground`);
  const background = parseColor(record.background, `${path}.background`);
  if (foreground != null && !colorsEqual(foreground, defaultColors.foreground)) {
    codes.push(colorCode(38, foreground));
  }
  if (background != null && !colorsEqual(background, defaultColors.background)) {
    codes.push(colorCode(48, background));
  }

  const signature = codes.join(";");
  return {
    signature,
    sgr: codes.map((code) => `\u001b[${code}m`).join(""),
  };
};

const NEUTRAL_STYLE: ResolvedStyle = { signature: "0", sgr: ANSI_RESET };

const parseStyles = (
  value: unknown,
  frame: Record<string, unknown>,
): Map<number, ResolvedStyle> => {
  const rawStyles = requireArray(value, "styles");
  if (rawStyles.length === 0) fail("styles must not be empty");
  if (rawStyles.length > MAX_STYLES) fail(`styles exceeds the limit of ${MAX_STYLES}`);

  const records = rawStyles.map((rawStyle, index) => {
    const path = `styles[${index}]`;
    const record = requireRecord(rawStyle, path);
    const id = requireInteger(record.id, `${path}.id`, { min: 0, max: MAX_STYLE_ID });
    return { id, path, record };
  });
  const ids = new Set<number>();
  records.forEach(({ id, path }) => {
    if (ids.has(id)) fail(`${path}.id duplicates style id ${id}`);
    ids.add(id);
  });

  const defaultRecord = records.find(({ id }) => id === 0)?.record;
  const defaultColors: DefaultColors = {
    foreground:
      parseColor(frame.terminal_foreground, "terminal_foreground") ??
      parseColor(defaultRecord?.foreground, "styles[id=0].foreground"),
    background:
      parseColor(frame.terminal_background, "terminal_background") ??
      parseColor(defaultRecord?.background, "styles[id=0].background"),
  };
  const styles = new Map<number, ResolvedStyle>();
  records.forEach(({ id, path, record }) => {
    styles.set(id, resolveStyle(record, path, defaultColors));
  });
  return styles;
};

const sanitizeTerminalText = (text: string): string => {
  let sanitized = "";
  for (const scalar of text) {
    const value = scalar.codePointAt(0)!;
    sanitized += value <= 0x1f || (value >= 0x7f && value <= 0x9f) ? " " : scalar;
  }
  return sanitized;
};

const graphemeCount = (text: string): number => Array.from(GRAPHEME_SEGMENTER.segment(text)).length;

const parseSpan = (
  value: unknown,
  path: string,
  rowCount: number,
  columns: number,
  styles: Map<number, ResolvedStyle>,
  textBudget: { bytes: number },
): ValidatedSpan => {
  const record = requireRecord(value, path);
  const row = requireInteger(record.row, `${path}.row`, { min: 0, max: rowCount - 1 });
  const column = requireInteger(record.column, `${path}.column`, {
    min: 0,
    max: columns - 1,
  });
  const styleId = requireInteger(record.style_id, `${path}.style_id`, {
    min: 0,
    max: MAX_STYLE_ID,
  });
  const style = styles.get(styleId);
  if (style == null) return fail(`${path}.style_id references unknown style id ${styleId}`);

  const rawText = requireString(record.text, `${path}.text`);
  textBudget.bytes += UTF8_ENCODER.encode(rawText).byteLength;
  if (textBudget.bytes > MAX_TOTAL_TEXT_BYTES) {
    fail(`span text exceeds the total limit of ${MAX_TOTAL_TEXT_BYTES} bytes`);
  }
  const text = sanitizeTerminalText(rawText);
  const textWidth = graphemeCount(text);
  const width =
    record.cell_width == null
      ? textWidth
      : requireInteger(record.cell_width, `${path}.cell_width`, { min: 1, max: columns });
  if (width <= 0) fail(`${path} must occupy at least one cell`);
  if (textWidth > width) fail(`${path}.text exceeds cell_width`);
  if (column + width > columns) fail(`${path} exceeds the ${columns}-column grid`);

  return { column, path, row, style, text, width };
};

const parseSpanRows = (
  rawSpans: unknown[],
  path: string,
  rowCount: number,
  columns: number,
  styles: Map<number, ResolvedStyle>,
  textBudget: { bytes: number },
): ValidatedSpan[][] => {
  const rows = Array.from({ length: rowCount }, (): ValidatedSpan[] => []);
  rawSpans.forEach((rawSpan, index) => {
    const span = parseSpan(rawSpan, `${path}[${index}]`, rowCount, columns, styles, textBudget);
    rows[span.row]!.push(span);
  });

  for (const spans of rows) {
    spans.sort((left, right) => left.column - right.column);
    let previousEnd = 0;
    for (const span of spans) {
      if (span.column < previousEnd) fail(`${span.path} overlaps a previous span`);
      previousEnd = span.column + span.width;
    }
  }
  return rows;
};

const appendRun = (runs: StyledRun[], style: ResolvedStyle, text: string): void => {
  if (text.length === 0) return;
  const previous = runs.at(-1);
  if (previous?.style.signature === style.signature) {
    previous.text += text;
    return;
  }
  runs.push({ style, text });
};

const renderLine = (spans: ValidatedSpan[], defaultStyle: ResolvedStyle): CmuxRenderGridLine => {
  const runs: StyledRun[] = [];
  let column = 0;
  for (const span of spans) {
    if (span.column > column) {
      appendRun(runs, defaultStyle, " ".repeat(span.column - column));
    }
    appendRun(runs, span.style, span.text);
    column = span.column + span.width;
  }

  let styled = ANSI_RESET;
  let activeSignature = NEUTRAL_STYLE.signature;
  for (const run of runs) {
    if (run.style.signature !== activeSignature) {
      styled += run.style.sgr;
      activeSignature = run.style.signature;
    }
    styled += run.text;
  }
  styled += ANSI_RESET;
  return { plain: runs.map((run) => run.text).join(""), styled };
};

const renderRows = (rows: ValidatedSpan[][], defaultStyle: ResolvedStyle): CmuxRenderGridLine[] =>
  rows.map((spans) => renderLine(spans, defaultStyle));

const parseActiveScreen = (value: unknown): CmuxRenderGridScreen => {
  if (value !== "primary" && value !== "alternate") {
    return fail('active_screen must be either "primary" or "alternate"');
  }
  return value;
};

const normalizeMaxLines = (value: number | undefined): number => {
  if (value == null) return CMUX_RENDER_GRID_MAX_TAIL_LINES;
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("maxLines must be a positive integer");
  }
  return Math.min(value, CMUX_RENDER_GRID_MAX_TAIL_LINES);
};

export const renderCmuxRenderGridTail = (
  input: unknown,
  options: CmuxRenderGridOptions,
): CmuxRenderGridTail => {
  if (!UUID_PATTERN.test(options.expectedSurfaceId)) {
    fail("expectedSurfaceId must be a UUID");
  }
  const maxLines = normalizeMaxLines(options.maxLines);
  const frame = requireRecord(input, "render_grid");
  if (frame.format !== CMUX_RENDER_GRID_FORMAT) {
    fail(`format must be ${CMUX_RENDER_GRID_FORMAT}`);
  }

  const surfaceId = requireString(frame.surface_id, "surface_id");
  if (!UUID_PATTERN.test(surfaceId)) fail("surface_id must be a UUID");
  if (surfaceId.toLowerCase() !== options.expectedSurfaceId.toLowerCase()) {
    fail("surface_id does not match the requested surface");
  }
  requireInteger(frame.state_seq, "state_seq", { min: 0, max: Number.MAX_SAFE_INTEGER });
  const columns = requireInteger(frame.columns, "columns", { min: 1, max: MAX_DIMENSION });
  const rowCount = requireInteger(frame.rows, "rows", { min: 1, max: MAX_DIMENSION });
  if (requireBoolean(frame.full, "full") !== true) fail("full must be true");
  const activeScreen = parseActiveScreen(frame.active_screen);
  const scrollbackRows = requireInteger(frame.scrollback_rows, "scrollback_rows", {
    min: 0,
    max: MAX_SCROLLBACK_ROWS,
  });
  const styles = parseStyles(frame.styles, frame);
  const rawScrollbackSpans = requireArray(frame.scrollback_spans, "scrollback_spans");
  const rawRowSpans = requireArray(frame.row_spans, "row_spans");
  if (rawScrollbackSpans.length + rawRowSpans.length > MAX_TOTAL_SPANS) {
    fail(`spans exceeds the total limit of ${MAX_TOTAL_SPANS}`);
  }

  const textBudget = { bytes: 0 };
  const scrollback = parseSpanRows(
    rawScrollbackSpans,
    "scrollback_spans",
    scrollbackRows,
    columns,
    styles,
    textBudget,
  );
  const viewport = parseSpanRows(rawRowSpans, "row_spans", rowCount, columns, styles, textBudget);
  const defaultStyle = styles.get(0) ?? NEUTRAL_STYLE;
  const allLines = [...renderRows(scrollback, defaultStyle), ...renderRows(viewport, defaultStyle)];

  return {
    activeScreen,
    columns,
    sourceLineCount: allLines.length,
    lines: allLines.slice(-maxLines),
  };
};
