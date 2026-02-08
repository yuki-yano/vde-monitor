import { describe, expect, it, vi } from "vitest";

vi.mock("execa", () => {
  return {
    execa: vi.fn(async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
    })),
  };
});

const getExeca = async () => {
  const mod = await import("execa");
  return mod.execa as unknown as ReturnType<typeof vi.fn>;
};

const loadModule = async () => {
  await vi.resetModules();
  const execa = await getExeca();
  execa.mockReset();
  execa.mockResolvedValue({
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
  return import("./agent-resolver-process");
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("agent-resolver-process", () => {
  it("deduplicates in-flight process command lookup by pid", async () => {
    const { getProcessCommand } = await loadModule();
    const execa = await getExeca();

    const deferred = createDeferred<{ stdout: string; stderr: string; exitCode: number }>();
    execa.mockImplementation(() => deferred.promise);

    const first = getProcessCommand(100);
    const second = getProcessCommand(100);

    expect(execa).toHaveBeenCalledTimes(1);

    deferred.resolve({ stdout: "codex", stderr: "", exitCode: 0 });
    await expect(first).resolves.toBe("codex");
    await expect(second).resolves.toBe("codex");
  });

  it("keeps process command cache valid based on completion time", async () => {
    const { getProcessCommand } = await loadModule();
    const execa = await getExeca();
    let nowMs = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    execa.mockImplementation(async () => {
      nowMs = 1500;
      return { stdout: "claude", stderr: "", exitCode: 0 };
    });

    await expect(getProcessCommand(200)).resolves.toBe("claude");
    await expect(getProcessCommand(200)).resolves.toBe("claude");

    expect(execa).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it("deduplicates in-flight process snapshot lookup", async () => {
    const { findAgentFromPidTree } = await loadModule();
    const execa = await getExeca();

    const deferred = createDeferred<{ stdout: string; stderr: string; exitCode: number }>();
    execa.mockImplementation(async (_file: string, args?: readonly string[] | null) => {
      const actualArgs = Array.isArray(args) ? args : [];
      if (actualArgs[0] === "-ax") {
        return deferred.promise;
      }
      throw new Error(`Unexpected args: ${actualArgs.join(" ")}`);
    });

    const first = findAgentFromPidTree(100);
    const second = findAgentFromPidTree(100);

    expect(execa).toHaveBeenCalledTimes(1);

    deferred.resolve({ stdout: "100 1 bash\n200 100 codex\n", stderr: "", exitCode: 0 });
    await expect(first).resolves.toBe("codex");
    await expect(second).resolves.toBe("codex");
  });

  it("keeps process snapshot cache valid based on completion time", async () => {
    const { findAgentFromPidTree } = await loadModule();
    const execa = await getExeca();
    let nowMs = 5000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    execa.mockImplementation(async (_file: string, args?: readonly string[] | null) => {
      const actualArgs = Array.isArray(args) ? args : [];
      if (actualArgs[0] === "-ax") {
        nowMs = 6500;
        return { stdout: "100 1 bash\n200 100 codex\n", stderr: "", exitCode: 0 };
      }
      throw new Error(`Unexpected args: ${actualArgs.join(" ")}`);
    });

    await expect(findAgentFromPidTree(100)).resolves.toBe("codex");
    await expect(findAgentFromPidTree(100)).resolves.toBe("codex");

    expect(execa).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it("deduplicates in-flight tty lookup using normalized tty key", async () => {
    const { getAgentFromTty } = await loadModule();
    const execa = await getExeca();

    const deferred = createDeferred<{ stdout: string; stderr: string; exitCode: number }>();
    execa.mockImplementation(async (_file: string, args?: readonly string[] | null) => {
      const actualArgs = Array.isArray(args) ? args : [];
      if (actualArgs.includes("-t")) {
        return deferred.promise;
      }
      throw new Error(`Unexpected args: ${actualArgs.join(" ")}`);
    });

    const first = getAgentFromTty("/dev/ttys001");
    const second = getAgentFromTty("ttys001");

    expect(execa).toHaveBeenCalledTimes(1);

    deferred.resolve({ stdout: "claude", stderr: "", exitCode: 0 });
    await expect(first).resolves.toBe("claude");
    await expect(second).resolves.toBe("claude");
  });

  it("keeps tty agent cache valid based on completion time", async () => {
    const { getAgentFromTty } = await loadModule();
    const execa = await getExeca();
    let nowMs = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    execa.mockImplementation(async (_file: string, args?: readonly string[] | null) => {
      const actualArgs = Array.isArray(args) ? args : [];
      if (actualArgs.includes("-t")) {
        nowMs = 1500;
        return { stdout: "claude", stderr: "", exitCode: 0 };
      }
      throw new Error(`Unexpected args: ${actualArgs.join(" ")}`);
    });

    await expect(getAgentFromTty("ttys001")).resolves.toBe("claude");
    await expect(getAgentFromTty("ttys001")).resolves.toBe("claude");

    expect(execa).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });
});
