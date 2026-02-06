import type { AllowedKey } from "@vde-monitor/shared";

import { CTRL_KEY_MAP } from "./sessionControlKeys";

type ResolveRawKeyInputArgs = {
  key: string;
  ctrlActive: boolean;
  shiftActive: boolean;
};

type ResolveRawKeyResult = {
  key: AllowedKey;
  suppressBeforeInput?: boolean;
};

type ResolveRawKeyResultOrContinue = ResolveRawKeyResult | undefined;

const isArrowKey = (key: string): key is "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" =>
  key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";

const mapArrowKey = (key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"): AllowedKey => {
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  return "Right";
};

const mapWithCtrl = (base: AllowedKey, ctrlActive: boolean): AllowedKey => {
  if (!ctrlActive) {
    return base;
  }
  const mapped = CTRL_KEY_MAP[base];
  return mapped ? (mapped as AllowedKey) : base;
};

const resolveTabKey = ({
  key,
  ctrlActive,
  shiftActive,
}: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (key !== "Tab") {
    return undefined;
  }
  const base = (shiftActive ? "BTab" : "Tab") as AllowedKey;
  return { key: mapWithCtrl(base, ctrlActive) };
};

const resolveEscapeKey = ({
  key,
  ctrlActive,
}: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (key !== "Escape") {
    return undefined;
  }
  return { key: mapWithCtrl("Escape", ctrlActive) };
};

const resolveCtrlEnterKey = ({
  key,
  ctrlActive,
}: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (!(key === "Enter" && ctrlActive)) {
    return undefined;
  }
  return { key: "C-Enter" };
};

const resolveArrowKey = ({
  key,
  ctrlActive,
}: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (!isArrowKey(key)) {
    return undefined;
  }
  return { key: mapWithCtrl(mapArrowKey(key), ctrlActive) };
};

const resolveNavigationKey = ({ key }: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (key === "Home" || key === "End" || key === "PageUp" || key === "PageDown") {
    return { key: key as AllowedKey };
  }
  return undefined;
};

const resolveFunctionKey = ({ key }: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (!/^F(1[0-2]|[1-9])$/.test(key)) {
    return undefined;
  }
  return { key: key as AllowedKey };
};

const resolveCtrlLetterKey = ({
  key,
  ctrlActive,
}: ResolveRawKeyInputArgs): ResolveRawKeyResultOrContinue => {
  if (ctrlActive && key.length === 1 && /[a-z]/i.test(key)) {
    return {
      key: `C-${key.toLowerCase()}` as AllowedKey,
      suppressBeforeInput: true,
    };
  }
  return undefined;
};

const keyResolvers = [
  resolveTabKey,
  resolveEscapeKey,
  resolveCtrlEnterKey,
  resolveArrowKey,
  resolveNavigationKey,
  resolveFunctionKey,
  resolveCtrlLetterKey,
] as const;

export const resolveRawKeyInput = (args: ResolveRawKeyInputArgs): ResolveRawKeyResult | null => {
  for (const resolver of keyResolvers) {
    const resolved = resolver(args);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};
