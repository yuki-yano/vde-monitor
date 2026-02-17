import { atom } from "jotai";

export type PreviewFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  lines: number;
};

export const sidebarHoveredPaneIdAtom = atom<string | null>(null);
export const sidebarPreviewFrameAtom = atom<PreviewFrame | null>(null);
