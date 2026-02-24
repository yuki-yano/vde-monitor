import { render, screen } from "@testing-library/react";
import { Provider as JotaiProvider, createStore, useAtomValue } from "jotai";
import { describe, expect, it } from "vitest";

import { connectedAtom, sessionApiAtom } from "./atoms/sessionDetailAtoms";
import { SessionDetailProvider } from "./SessionDetailProvider";

const AtomProbe = () => {
  const connected = useAtomValue(connectedAtom);
  const api = useAtomValue(sessionApiAtom);

  return (
    <div>
      <div data-testid="connected">{connected ? "true" : "false"}</div>
      <div data-testid="api">{api ? "ready" : "missing"}</div>
    </div>
  );
};

describe("SessionDetailProvider", () => {
  it("renders children", () => {
    render(
      <SessionDetailProvider paneId="pane-1">
        <div data-testid="child">child</div>
      </SessionDetailProvider>,
    );

    expect(screen.getByTestId("child").textContent).toBe("child");
  });

  it("does not mutate existing atoms", () => {
    const store = createStore();
    store.set(connectedAtom, false);

    render(
      <JotaiProvider store={store}>
        <SessionDetailProvider paneId="pane-2">
          <AtomProbe />
        </SessionDetailProvider>
      </JotaiProvider>,
    );

    expect(screen.getByTestId("connected").textContent).toBe("false");
    expect(screen.getByTestId("api").textContent).toBe("ready");
  });
});
