import { atom } from "jotai";

export const quickPanelOpenAtom = atom(false);
export const logModalOpenAtom = atom(false);
export const selectedPaneIdAtom = atom<string | null>(null);
export const logModalIsAtBottomAtom = atom(true);
export const logModalDisplayLinesAtom = atom<string[]>([]);
