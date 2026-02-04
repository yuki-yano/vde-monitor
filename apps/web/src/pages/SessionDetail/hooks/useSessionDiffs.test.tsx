// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  diffErrorAtom,
  diffFilesAtom,
  diffLoadingAtom,
  diffLoadingFilesAtom,
  diffOpenAtom,
  diffSummaryAtom,
} from "../atoms/diffAtoms";
import { createDiffFile, createDiffSummary } from "../test-helpers";
import { useSessionDiffs } from "./useSessionDiffs";

describe("useSessionDiffs", () => {
  const createWrapper = () => {
    const store = createStore();
    store.set(diffSummaryAtom, null);
    store.set(diffErrorAtom, null);
    store.set(diffLoadingAtom, false);
    store.set(diffFilesAtom, {});
    store.set(diffOpenAtom, {});
    store.set(diffLoadingFilesAtom, {});
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  it("loads diff summary on mount", async () => {
    const diffSummary = createDiffSummary();
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.diffSummary).not.toBeNull();
    });

    expect(requestDiffSummary).toHaveBeenCalledWith("pane-1", { force: true });
  });

  it("loads diff file when toggled open", async () => {
    const diffSummary = createDiffSummary();
    const requestDiffSummary = vi.fn().mockResolvedValue(diffSummary);
    const requestDiffFile = vi.fn().mockResolvedValue(createDiffFile());

    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSessionDiffs({
          paneId: "pane-1",
          connected: true,
          requestDiffSummary,
          requestDiffFile,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.diffSummary).not.toBeNull();
    });

    result.current.toggleDiff("src/index.ts");

    await waitFor(() => {
      expect(requestDiffFile).toHaveBeenCalledWith("pane-1", "src/index.ts", "HEAD", {
        force: true,
      });
    });
  });
});
