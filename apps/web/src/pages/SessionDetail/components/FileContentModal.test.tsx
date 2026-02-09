// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileContentModal } from "./FileContentModal";

vi.mock("./ShikiCodeBlock", () => ({
  ShikiCodeBlock: ({ code, highlightLine }: { code: string; highlightLine?: number | null }) => (
    <pre data-testid="shiki-code" data-highlight-line={highlightLine == null ? "" : highlightLine}>
      {code}
    </pre>
  ),
}));

type FileContentModalState = Parameters<typeof FileContentModal>[0]["state"];
type FileContentModalActions = Parameters<typeof FileContentModal>[0]["actions"];

const createState = (overrides: Partial<FileContentModalState> = {}): FileContentModalState => ({
  open: true,
  path: "src/index.ts",
  loading: false,
  error: null,
  file: {
    path: "src/index.ts",
    sizeBytes: 12,
    isBinary: false,
    truncated: false,
    languageHint: "typescript",
    content: "const value = 1;",
  },
  markdownViewMode: "code",
  showLineNumbers: false,
  copiedPath: false,
  copyError: null,
  highlightLine: null,
  theme: "latte",
  ...overrides,
});

const createActions = (
  overrides: Partial<FileContentModalActions> = {},
): FileContentModalActions => ({
  onClose: vi.fn(),
  onToggleLineNumbers: vi.fn(),
  onCopyPath: vi.fn(async () => undefined),
  onMarkdownViewModeChange: vi.fn(),
  ...overrides,
});

describe("FileContentModal", () => {
  it("returns null when closed", () => {
    const { container } = render(
      <FileContentModal state={createState({ open: false })} actions={createActions()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders line-number toggle, copy, close in that order", () => {
    render(<FileContentModal state={createState()} actions={createActions()} />);

    const lineNumberButton = screen.getByRole("button", { name: "Show line numbers" });
    const copyButton = screen.getByRole("button", { name: "Copy file path" });
    const closeButton = screen.getByRole("button", { name: "Close file content modal" });
    expect(
      lineNumberButton.compareDocumentPosition(copyButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      copyButton.compareDocumentPosition(closeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows markdown preview and allows switching mode", () => {
    const onMarkdownViewModeChange = vi.fn();
    render(
      <FileContentModal
        state={createState({
          path: "README.md",
          file: {
            path: "README.md",
            sizeBytes: 20,
            isBinary: false,
            truncated: false,
            languageHint: "markdown",
            content: "# Hello\n",
          },
          markdownViewMode: "preview",
        })}
        actions={createActions({ onMarkdownViewModeChange })}
      />,
    );

    expect(screen.getByText("Hello")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Code" }));
    expect(onMarkdownViewModeChange).toHaveBeenCalledWith("code");
  });

  it("does not pass file highlight line into markdown fenced code blocks", () => {
    render(
      <FileContentModal
        state={createState({
          path: "README.md",
          file: {
            path: "README.md",
            sizeBytes: 50,
            isBinary: false,
            truncated: false,
            languageHint: "markdown",
            content: "```ts\nconst value = 1;\n```",
          },
          markdownViewMode: "preview",
          highlightLine: 42,
        })}
        actions={createActions()}
      />,
    );

    expect(screen.getByTestId("shiki-code").getAttribute("data-highlight-line")).toBe("");
  });

  it("shows binary message for binary files", () => {
    render(
      <FileContentModal
        state={createState({
          file: {
            path: "archive.bin",
            sizeBytes: 8,
            isBinary: true,
            truncated: false,
            languageHint: null,
            content: null,
          },
        })}
        actions={createActions()}
      />,
    );

    expect(screen.getByText("Binary file preview is not available.")).toBeTruthy();
  });

  it("calls copy action from copy button", () => {
    const onCopyPath = vi.fn(async () => undefined);
    render(<FileContentModal state={createState()} actions={createActions({ onCopyPath })} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy file path" }));
    expect(onCopyPath).toHaveBeenCalled();
  });

  it("calls line-number toggle action", () => {
    const onToggleLineNumbers = vi.fn();
    render(
      <FileContentModal
        state={createState({ showLineNumbers: true })}
        actions={createActions({ onToggleLineNumbers })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide line numbers" }));
    expect(onToggleLineNumbers).toHaveBeenCalled();
  });
});
