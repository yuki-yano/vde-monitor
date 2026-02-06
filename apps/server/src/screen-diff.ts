export type ScreenDelta = {
  start: number;
  deleteCount: number;
  insertLines: string[];
};

type EditOp = {
  type: "equal" | "insert" | "delete";
  line: string;
};

const readInt = (arr: Int32Array, index: number) => arr[index] ?? 0;

const chooseForwardX = (d: number, k: number, v: Int32Array, index: number) => {
  if (k === -d) {
    return readInt(v, index + 1);
  }
  if (k === d) {
    return readInt(v, index - 1) + 1;
  }
  const left = readInt(v, index - 1);
  const right = readInt(v, index + 1);
  return left < right ? right : left + 1;
};

const walkDiagonal = (before: string[], after: string[], x: number, y: number) => {
  let nextX = x;
  let nextY = y;
  while (nextX < before.length && nextY < after.length && before[nextX] === after[nextY]) {
    nextX += 1;
    nextY += 1;
  }
  return { x: nextX, y: nextY };
};

const buildTrace = (before: string[], after: string[]) => {
  const n = before.length;
  const m = after.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d += 1) {
    let done = false;
    for (let k = -d; k <= d; k += 2) {
      const index = k + offset;
      const x = chooseForwardX(d, k, v, index);
      const diagonal = walkDiagonal(before, after, x, x - k);
      v[index] = diagonal.x;
      if (diagonal.x >= n && diagonal.y >= m) {
        done = true;
        break;
      }
    }
    trace.push(new Int32Array(v));
    if (done) {
      break;
    }
  }
  return { trace, offset };
};

const choosePrevK = (d: number, k: number, vSnapshot: Int32Array, offset: number) => {
  const index = k + offset;
  if (k === -d) {
    return k + 1;
  }
  if (k === d) {
    return k - 1;
  }
  return readInt(vSnapshot, index - 1) < readInt(vSnapshot, index + 1) ? k + 1 : k - 1;
};

const pushEqualOps = (
  edits: EditOp[],
  before: string[],
  x: number,
  y: number,
  targetX: number,
  targetY: number,
) => {
  let nextX = x;
  let nextY = y;
  while (nextX > targetX && nextY > targetY) {
    edits.push({ type: "equal", line: before[nextX - 1] ?? "" });
    nextX -= 1;
    nextY -= 1;
  }
  return { x: nextX, y: nextY };
};

const applyBacktrackStep = (
  edits: EditOp[],
  before: string[],
  after: string[],
  trace: Int32Array[],
  offset: number,
  d: number,
  x: number,
  y: number,
) => {
  const vSnapshot = trace[d];
  if (!vSnapshot) {
    return { done: true, x, y };
  }
  const k = x - y;
  const prevK = choosePrevK(d, k, vSnapshot, offset);
  const prevX = readInt(vSnapshot, prevK + offset);
  const prevY = prevX - prevK;
  const diagonal = pushEqualOps(edits, before, x, y, prevX, prevY);
  if (diagonal.x === prevX) {
    edits.push({ type: "insert", line: after[prevY] ?? "" });
    return { done: false, x: diagonal.x, y: diagonal.y - 1 };
  }
  edits.push({ type: "delete", line: before[prevX] ?? "" });
  return { done: false, x: diagonal.x - 1, y: diagonal.y };
};

const pushRemainingOps = (
  edits: EditOp[],
  before: string[],
  after: string[],
  x: number,
  y: number,
) => {
  let nextX = x;
  let nextY = y;
  while (nextX > 0 && nextY > 0) {
    edits.push({ type: "equal", line: before[nextX - 1] ?? "" });
    nextX -= 1;
    nextY -= 1;
  }
  while (nextX > 0) {
    edits.push({ type: "delete", line: before[nextX - 1] ?? "" });
    nextX -= 1;
  }
  while (nextY > 0) {
    edits.push({ type: "insert", line: after[nextY - 1] ?? "" });
    nextY -= 1;
  }
};

const buildEditScript = (before: string[], after: string[]): EditOp[] => {
  if (before.length === 0 && after.length === 0) {
    return [];
  }

  const { trace, offset } = buildTrace(before, after);
  const edits: EditOp[] = [];
  let x = before.length;
  let y = after.length;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const step = applyBacktrackStep(edits, before, after, trace, offset, d, x, y);
    if (step.done) {
      break;
    }
    x = step.x;
    y = step.y;
  }

  pushRemainingOps(edits, before, after, x, y);
  edits.reverse();
  return edits;
};

export const buildScreenDeltas = (before: string[], after: string[]): ScreenDelta[] => {
  if (before.length === 0 && after.length === 0) {
    return [];
  }

  const ops = buildEditScript(before, after);
  const deltas: ScreenDelta[] = [];
  let current: ScreenDelta | null = null;
  let index = 0;

  const flush = () => {
    if (!current) return;
    if (current.deleteCount > 0 || current.insertLines.length > 0) {
      deltas.push(current);
    }
    current = null;
  };

  ops.forEach((op) => {
    if (op.type === "equal") {
      flush();
      index += 1;
      return;
    }
    if (!current) {
      current = { start: index, deleteCount: 0, insertLines: [] };
    }
    if (op.type === "delete") {
      current.deleteCount += 1;
      index += 1;
      return;
    }
    current.insertLines.push(op.line);
  });

  flush();
  return deltas;
};

const countChangedLines = (deltas: ScreenDelta[]): number => {
  return deltas.reduce(
    (total, delta) => total + Math.max(delta.deleteCount, delta.insertLines.length),
    0,
  );
};

export const shouldSendFull = (
  beforeLength: number,
  afterLength: number,
  deltas: ScreenDelta[],
): boolean => {
  const totalLines = Math.max(beforeLength, afterLength);
  const changedLines = countChangedLines(deltas);
  if (deltas.length > 10) {
    return true;
  }
  if (changedLines > 200) {
    return true;
  }
  if (totalLines === 0) {
    return false;
  }
  return changedLines > totalLines * 0.5;
};
