import { stripAnsi } from "./ansi-text-utils";

// tmux capture-pane -e emits SGR state changes only where they occur, so the
// state active at the end of a physical line silently applies to the next
// line. Rendering happens per line, so that carried state must be made
// explicit at the start of each line before conversion.

const sgrSequencePattern = new RegExp(String.raw`\[([0-9;]*)m`, "g");
const leadingSgrPattern = new RegExp(String.raw`^(?:\[[0-9;]*m)+`);

type SgrAttribute =
  | "bold"
  | "dim"
  | "italic"
  | "underline"
  | "blink"
  | "inverse"
  | "hidden"
  | "strike"
  | "fg"
  | "bg"
  | "underlineColor";

const attributeByOnCode: Record<string, SgrAttribute> = {
  "1": "bold",
  "2": "dim",
  "3": "italic",
  "4": "underline",
  "5": "blink",
  "6": "blink",
  "7": "inverse",
  "8": "hidden",
  "9": "strike",
};

const attributesByOffCode: Record<string, readonly SgrAttribute[]> = {
  "21": ["bold"],
  "22": ["bold", "dim"],
  "23": ["italic"],
  "24": ["underline"],
  "25": ["blink"],
  "27": ["inverse"],
  "28": ["hidden"],
  "29": ["strike"],
  "39": ["fg"],
  "49": ["bg"],
  "59": ["underlineColor"],
};

const extendedColorAttributeByCode: Record<string, SgrAttribute> = {
  "38": "fg",
  "48": "bg",
  "58": "underlineColor",
};

const attributeEmitOrder: readonly SgrAttribute[] = [
  "bold",
  "dim",
  "italic",
  "underline",
  "blink",
  "inverse",
  "hidden",
  "strike",
  "fg",
  "bg",
  "underlineColor",
];

type SgrState = Map<SgrAttribute, string>;

const applySgrParams = (state: SgrState, params: string) => {
  const tokens = params.length === 0 ? ["0"] : params.split(";");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token === "" || token === "0") {
      state.clear();
      continue;
    }
    const extendedAttribute = extendedColorAttributeByCode[token];
    if (extendedAttribute) {
      const mode = tokens[index + 1];
      const tokenCount = mode === "5" ? 3 : mode === "2" ? 5 : 1;
      if (tokenCount > 1) {
        state.set(extendedAttribute, tokens.slice(index, index + tokenCount).join(";"));
      }
      index += tokenCount - 1;
      continue;
    }
    const onAttribute = attributeByOnCode[token];
    if (onAttribute) {
      state.set(onAttribute, token);
      continue;
    }
    const offAttributes = attributesByOffCode[token];
    if (offAttributes) {
      offAttributes.forEach((attribute) => state.delete(attribute));
      continue;
    }
    const numeric = Number.parseInt(token, 10);
    if ((numeric >= 30 && numeric <= 37) || (numeric >= 90 && numeric <= 97)) {
      state.set("fg", token);
      continue;
    }
    if ((numeric >= 40 && numeric <= 47) || (numeric >= 100 && numeric <= 107)) {
      state.set("bg", token);
    }
  }
};

const consumeSgrSequences = (state: SgrState, segment: string) => {
  for (const match of segment.matchAll(sgrSequencePattern)) {
    applySgrParams(state, match[1] ?? "");
  }
};

// ansi-to-html misreads extended colors inside combined sequences, so each
// attribute is emitted as its own sequence.
const serializeSgrState = (state: SgrState) =>
  attributeEmitOrder
    .filter((attribute) => state.has(attribute))
    .map((attribute) => `[${state.get(attribute)}m`)
    .join("");

export const applyAnsiSgrCarryover = (lines: string[]): string[] => {
  const state: SgrState = new Map();
  return lines.map((line) => {
    // Fold leading sequences into the carried state so a reset at the start
    // of a line cancels the carryover instead of leaving a phantom span.
    const leading = line.match(leadingSgrPattern)?.[0];
    let rest = line;
    if (leading) {
      consumeSgrSequences(state, leading);
      rest = line.slice(leading.length);
    }
    const prefix = state.size > 0 && stripAnsi(rest).length > 0 ? serializeSgrState(state) : "";
    consumeSgrSequences(state, rest);
    return `${prefix}${rest}`;
  });
};
