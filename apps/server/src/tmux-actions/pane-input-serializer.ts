import { AsyncLocalStorage } from "node:async_hooks";

export type SerializePaneInput = <T>(paneId: string, operation: () => Promise<T>) => Promise<T>;

export const createPaneInputSerializer = (): SerializePaneInput => {
  const paneInputTails = new Map<string, Promise<void>>();
  const activePaneInputs = new AsyncLocalStorage<ReadonlySet<string>>();

  return async <T>(paneId: string, operation: () => Promise<T>): Promise<T> => {
    const active = activePaneInputs.getStore();
    if (active?.has(paneId)) return operation();

    const previous = paneInputTails.get(paneId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    paneInputTails.set(paneId, current);
    await previous;
    try {
      const nextActive = new Set(active ?? []);
      nextActive.add(paneId);
      return await activePaneInputs.run(nextActive, operation);
    } finally {
      release();
      if (paneInputTails.get(paneId) === current) {
        paneInputTails.delete(paneId);
      }
    }
  };
};
