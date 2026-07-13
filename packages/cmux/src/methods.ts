export const CMUX_METHODS = {
  authLogin: "auth.login",
  tree: "system.tree",
  top: "system.top",
  terminals: "debug.terminals",
  readText: "surface.read_text",
  sendText: "surface.send_text",
  sendKey: "surface.send_key",
  focus: "surface.focus",
  closeSurface: "surface.close",
  closeWorkspace: "workspace.close",
  tabAction: "tab.action",
} as const;

// These mobile rendering RPCs are intentionally excluded from the startup
// capability check. They augment screen capture when available, while
// surface.read_text remains the required capture API.
export const CMUX_RENDER_METHODS = {
  replay: "terminal.replay",
  scroll: "terminal.scroll",
} as const;
