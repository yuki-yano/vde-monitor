import {
  sessionConnectedAtom as sharedConnectedAtom,
  sessionApiAtom as sharedSessionApiAtom,
} from "@/state/session-state-atoms";

export const connectedAtom = sharedConnectedAtom;
export const sessionApiAtom = sharedSessionApiAtom;
