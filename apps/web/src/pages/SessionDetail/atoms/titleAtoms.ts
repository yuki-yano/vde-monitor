import { atom } from "jotai";

export const titleDraftAtom = atom("");
export const titleEditingAtom = atom(false);
export const titleSavingAtom = atom(false);
export const titleErrorAtom = atom<string | null>(null);
