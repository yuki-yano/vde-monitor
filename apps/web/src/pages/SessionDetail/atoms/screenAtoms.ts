import { atom } from "jotai";

import { renderAnsiLines } from "@/lib/ansi";
import {
  initialScreenLoadingState,
  type ScreenLoadingState,
  type ScreenMode,
} from "@/lib/screen-loading";

import {
  currentSessionAtom,
  highlightCorrectionsAtom,
  resolvedThemeAtom,
} from "./sessionDetailAtoms";

export const screenModeAtom = atom<ScreenMode>("text");
export const screenModeLoadedAtom = atom({ text: false, image: false });
export const screenAtBottomAtom = atom(true);
export const screenForceFollowAtom = atom(false);
export const screenTextAtom = atom("");
export const screenImageAtom = atom<string | null>(null);
export const screenFallbackReasonAtom = atom<string | null>(null);
export const screenErrorAtom = atom<string | null>(null);
export const screenLoadingAtom = atom<ScreenLoadingState>(initialScreenLoadingState);

export const screenLinesAtom = atom((get) => {
  const mode = get(screenModeAtom);
  if (mode !== "text") {
    return [];
  }
  const text = get(screenTextAtom) || "No screen data";
  const theme = get(resolvedThemeAtom);
  const session = get(currentSessionAtom);
  const agent =
    session?.agent === "codex" || session?.agent === "claude" ? session.agent : "unknown";
  const highlightCorrections = get(highlightCorrectionsAtom);
  return renderAnsiLines(text, theme, { agent, highlightCorrections });
});
