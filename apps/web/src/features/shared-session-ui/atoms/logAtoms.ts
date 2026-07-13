import { atom } from "jotai";

export const quickPanelOpenAtom = atom(false);
export const logModalOpenAtom = atom(false);
export const selectedPaneIdAtom = atom<string | null>(null);
export const logModalSnapRequestAtom = atom({ paneId: null as string | null, version: 0 });
