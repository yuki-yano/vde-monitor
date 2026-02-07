const editorCommandNames = new Set([
  "vim",
  "nvim",
  "vi",
  "gvim",
  "nvim-qt",
  "neovim",
  "view",
  "vimdiff",
  "nvimdiff",
]);

const normalizeCommandToken = (command: string | null | undefined) => {
  if (!command) return null;
  const normalized = command.trim();
  if (!normalized) return null;
  const token = normalized.split(/\s+/)[0];
  if (!token) return null;
  const unquoted = token.replace(/^["']|["']$/g, "");
  const binary = unquoted.replace(/^.*[\\/]/, "").toLowerCase();
  return binary || null;
};

export const isEditorCommand = (command: string | null | undefined) => {
  const binary = normalizeCommandToken(command);
  if (!binary) return false;
  return editorCommandNames.has(binary);
};
