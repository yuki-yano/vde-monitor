export const CTRL_KEY_MAP: Record<string, string> = {
  Left: "C-Left",
  Right: "C-Right",
  Up: "C-Up",
  Down: "C-Down",
  Tab: "C-Tab",
  Enter: "C-Enter",
  Escape: "C-Escape",
  BTab: "C-BTab",
};

export const mapKeyWithModifiers = (key: string, ctrlHeld: boolean, shiftHeld: boolean) => {
  if (shiftHeld && key === "Tab") {
    return "BTab";
  }
  if (ctrlHeld && CTRL_KEY_MAP[key]) {
    return CTRL_KEY_MAP[key];
  }
  return key;
};
