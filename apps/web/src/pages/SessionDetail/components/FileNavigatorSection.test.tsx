// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileNavigatorSection } from "./FileNavigatorSection";

const createProps = () => ({
  state: {
    unavailable: false,
    selectedFilePath: null,
    searchQuery: "",
    searchLoading: false,
    searchError: null,
    searchResult: null,
    searchMode: "all-matches" as const,
    treeLoading: false,
    treeError: null,
    treeNodes: [
      {
        path: "src",
        name: "src",
        kind: "directory" as const,
        depth: 0,
        selected: false,
        expanded: false,
        hasChildren: true,
        searchMatched: false,
        activeMatch: false,
        isIgnored: false,
      },
      {
        path: "src/index.ts",
        name: "index.ts",
        kind: "file" as const,
        depth: 1,
        selected: false,
        expanded: false,
        hasChildren: false,
        searchMatched: false,
        activeMatch: false,
        isIgnored: false,
      },
    ],
    rootTreeHasMore: false,
    searchHasMore: false,
  },
  actions: {
    onSearchQueryChange: vi.fn(),
    onSearchMove: vi.fn(),
    onSearchConfirm: vi.fn(),
    onToggleDirectory: vi.fn(),
    onSelectFile: vi.fn(),
    onOpenFileModal: vi.fn(),
    onLoadMoreTreeRoot: vi.fn(),
    onLoadMoreSearch: vi.fn(),
  },
});

describe("FileNavigatorSection", () => {
  it("renders unavailable message", () => {
    const props = createProps();
    props.state.unavailable = true;
    render(<FileNavigatorSection {...props} />);

    expect(screen.getByText("File navigator is unavailable for this session.")).toBeTruthy();
  });

  it("triggers tree and search actions", () => {
    const props = createProps();
    render(<FileNavigatorSection {...props} />);

    fireEvent.click(screen.getByText("src"));
    expect(props.actions.onToggleDirectory).toHaveBeenCalledWith("src");

    fireEvent.click(screen.getByText("index.ts"));
    expect(props.actions.onSelectFile).toHaveBeenCalledWith("src/index.ts");
    expect(props.actions.onOpenFileModal).toHaveBeenCalledWith("src/index.ts");

    const input = screen.getByLabelText("Search file path");
    fireEvent.change(input, { target: { value: "ind" } });
    expect(props.actions.onSearchQueryChange).toHaveBeenCalledWith("ind");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.actions.onSearchMove).toHaveBeenCalledWith(1);
    expect(props.actions.onSearchConfirm).toHaveBeenCalled();
  });

  it("shows clear button only when query exists and clears query on click", () => {
    const props = createProps();
    const { rerender } = render(<FileNavigatorSection {...props} />);

    expect(screen.queryByRole("button", { name: "Clear search query" })).toBeNull();

    const nextProps = createProps();
    nextProps.state.searchQuery = "index";
    rerender(<FileNavigatorSection {...nextProps} />);

    const clearButton = screen.getByRole("button", { name: "Clear search query" });
    fireEvent.click(clearButton);
    expect(nextProps.actions.onSearchQueryChange).toHaveBeenCalledWith("");
  });

  it("uses ignored color for ignored file and directory entries", () => {
    const props = createProps();
    const directoryNode = props.state.treeNodes[0];
    if (!directoryNode) {
      throw new Error("tree node is required");
    }
    props.state.treeNodes[0] = {
      ...directoryNode,
      isIgnored: true,
    };
    const targetNode = props.state.treeNodes[1];
    if (!targetNode) {
      throw new Error("tree node is required");
    }
    props.state.treeNodes[1] = {
      ...targetNode,
      isIgnored: true,
    };
    render(<FileNavigatorSection {...props} />);

    expect(screen.getByText("src").className).toContain("text-latte-overlay1");
    expect(screen.getByText("index.ts").className).toContain("text-latte-overlay1");
  });
});
