import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionListHeader } from "./SessionListHeader";

const FILTER_OPTIONS = [
  { value: "ALL", label: "ALL" },
  { value: "SHELL", label: "SHELL" },
];

const HeaderHarness = () => {
  const [query, setQuery] = useState("");
  return (
    <SessionListHeader
      connectionStatus="healthy"
      connectionIssue={null}
      filter="ALL"
      searchQuery={query}
      filterOptions={FILTER_OPTIONS}
      onFilterChange={vi.fn()}
      onSearchQueryChange={setQuery}
      onRefresh={vi.fn()}
      onOpenChatGrid={vi.fn()}
      onOpenUsage={vi.fn()}
    />
  );
};

describe("SessionListHeader focus regression", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps focus on search input after debounced query sync", () => {
    vi.useFakeTimers();
    render(<HeaderHarness />);

    const input = screen.getByRole("textbox", { name: "Search sessions" });
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "repo" } });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const latestInput = screen.getByRole("textbox", { name: "Search sessions" });
    expect((latestInput as HTMLInputElement).value).toBe("repo");
    expect(document.activeElement).toBe(latestInput);
  });

  it("flushes pending query update on blur", () => {
    vi.useFakeTimers();
    const onSearchQueryChange = vi.fn();
    render(
      <SessionListHeader
        connectionStatus="healthy"
        connectionIssue={null}
        filter="ALL"
        searchQuery=""
        filterOptions={FILTER_OPTIONS}
        onFilterChange={vi.fn()}
        onSearchQueryChange={onSearchQueryChange}
        onRefresh={vi.fn()}
        onOpenChatGrid={vi.fn()}
        onOpenUsage={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search sessions" });
    input.focus();
    fireEvent.change(input, { target: { value: "repo" } });
    fireEvent.blur(input);

    expect(onSearchQueryChange).toHaveBeenCalledWith("repo");
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
  });

  it("clears query without dispatching intermediate draft value", () => {
    vi.useFakeTimers();
    const onSearchQueryChange = vi.fn();
    render(
      <SessionListHeader
        connectionStatus="healthy"
        connectionIssue={null}
        filter="ALL"
        searchQuery="repo"
        filterOptions={FILTER_OPTIONS}
        onFilterChange={vi.fn()}
        onSearchQueryChange={onSearchQueryChange}
        onRefresh={vi.fn()}
        onOpenChatGrid={vi.fn()}
        onOpenUsage={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search sessions" });
    input.focus();

    const clearButton = screen.getByRole("button", { name: "Clear search" });
    const mouseDownEvent = createEvent.mouseDown(clearButton);
    fireEvent(clearButton, mouseDownEvent);
    fireEvent.click(clearButton);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
    expect(onSearchQueryChange).toHaveBeenCalledWith("");
    expect(onSearchQueryChange).not.toHaveBeenCalledWith("repo");
  });
});
