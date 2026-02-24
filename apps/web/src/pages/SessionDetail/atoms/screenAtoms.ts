import { atom } from "jotai";

import {
  type ScreenLoadingState,
  type ScreenMode,
  initialScreenLoadingState,
} from "@/lib/screen-loading";

export const screenModeAtom = atom<ScreenMode>("text");
export type ScreenWrapMode = "off" | "smart";

export const screenWrapModeAtom = atom<ScreenWrapMode>("off");
export const screenModeLoadedAtom = atom({ text: false, image: false });
export const screenAtBottomAtom = atom(true);
export const screenForceFollowAtom = atom(false);
export const screenTextAtom = atom("");
export const screenImageAtom = atom<string | null>(null);
export const screenFallbackReasonAtom = atom<string | null>(null);
export const screenErrorAtom = atom<string | null>(null);
export const screenLoadingAtom = atom<ScreenLoadingState>(initialScreenLoadingState);
