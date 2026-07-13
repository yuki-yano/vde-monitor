import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileContentModal } from "./FileContentModal";

vi.mock("./ShikiCodeBlock", () => ({
  ShikiCodeBlock: ({
    code,
    language,
    highlightLine,
  }: {
    code: string;
    language?: string | null;
    highlightLine?: number | null;
  }) => (
    <pre
      data-testid="shiki-code"
      data-language={language ?? ""}
      data-highlight-line={highlightLine == null ? "" : highlightLine}
    >
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
  diffAvailable: false,
  diffLoading: false,
  diffPatch: null,
  diffBinary: false,
  diffError: null,
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
  onLoadDiff: vi.fn(),
  ...overrides,
});

describe("FileContentModal", () => {
  it("returns null when closed", () => {
    const { container } = render(
      <FileContentModal state={createState({ open: false })} actions={createActions()} />,
    );
    expect(container.firstChild).toBeNull();
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

  it("renders HTML preview in a sandboxed iframe and allows switching mode", () => {
    const onMarkdownViewModeChange = vi.fn();
    render(
      <FileContentModal
        state={createState({
          path: "preview.html",
          file: {
            path: "preview.html",
            sizeBytes: 80,
            isBinary: false,
            truncated: false,
            languageHint: "html",
            content: "<!doctype html><main><h1>Hello HTML</h1></main>",
            preview: {
              token: "html-token",
              url: "about:blank#html-preview",
              mimeType: "text/html",
              expiresAt: "2026-07-13T01:00:00.000Z",
            },
          },
          markdownViewMode: "preview",
        })}
        actions={createActions({ onMarkdownViewModeChange })}
      />,
    );

    const iframe = screen.getByTitle("Preview of preview.html");
    expect(iframe.getAttribute("src")).toBe("about:blank#html-preview");
    expect(iframe.getAttribute("srcdoc")).toBeNull();
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Code" }));
    expect(onMarkdownViewModeChange).toHaveBeenCalledWith("code");
  });

  it("uses HTML highlighting when an HTML file is shown as code", () => {
    render(
      <FileContentModal
        state={createState({
          path: "preview.html",
          file: {
            path: "preview.html",
            sizeBytes: 40,
            isBinary: false,
            truncated: false,
            languageHint: "html",
            content: "<main>Hello HTML</main>",
          },
          markdownViewMode: "code",
          highlightLine: 3,
        })}
        actions={createActions()}
      />,
    );

    const code = screen.getByTestId("shiki-code");
    expect(code.getAttribute("data-language")).toBe("html");
    expect(code.getAttribute("data-highlight-line")).toBe("3");
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

  it("renders an image from its preview URL", () => {
    render(
      <FileContentModal
        state={createState({
          path: "assets/logo.png",
          file: {
            path: "assets/logo.png",
            sizeBytes: 8,
            isBinary: true,
            truncated: false,
            languageHint: null,
            content: null,
            preview: {
              token: "image-token",
              url: "/file-preview/image-token/logo.png",
              mimeType: "image/png",
              expiresAt: "2026-07-13T01:00:00.000Z",
            },
          },
        })}
        actions={createActions()}
      />,
    );

    const image = screen.getByRole("img", { name: "Preview of assets/logo.png" });
    expect(image.getAttribute("src")).toBe("/file-preview/image-token/logo.png");
    expect(screen.queryByText("Binary file preview is not available.")).toBeNull();
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

  it("shows diff tab when diff is available", () => {
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
          diffAvailable: true,
        })}
        actions={createActions()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Diff" })).toBeTruthy();
  });

  it("loads diff when diff tab is active", () => {
    const onLoadDiff = vi.fn();
    render(
      <FileContentModal
        state={createState({
          path: "src/index.ts",
          markdownViewMode: "diff",
          diffAvailable: true,
        })}
        actions={createActions({ onLoadDiff })}
      />,
    );

    expect(onLoadDiff).toHaveBeenCalledWith("src/index.ts");
  });

  it("renders diff patch when diff tab is selected", () => {
    render(
      <FileContentModal
        state={createState({
          markdownViewMode: "diff",
          diffAvailable: true,
          diffPatch: "@@ -1 +1 @@\n-old\n+new",
        })}
        actions={createActions()}
      />,
    );

    expect(screen.getByText(/\+new/)).toBeTruthy();
  });
});
