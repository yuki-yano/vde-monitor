import type { DiffFile, DiffSummary } from "@vde-monitor/shared";
import { atom } from "jotai";

export const diffSummaryAtom = atom<DiffSummary | null>(null);
export const diffErrorAtom = atom<string | null>(null);
export const diffLoadingAtom = atom(false);
export const diffFilesAtom = atom<Record<string, DiffFile>>({});
export const diffOpenAtom = atom<Record<string, boolean>>({});
export const diffLoadingFilesAtom = atom<Record<string, boolean>>({});
export const diffExpandedAtom = atom<Record<string, boolean>>({});
