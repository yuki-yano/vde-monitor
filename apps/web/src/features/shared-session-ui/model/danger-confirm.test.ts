import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmDangerousKey, confirmDangerousText, isDangerousText } from "./danger-confirm";

const stubConfirm = (result: boolean) => {
  const confirm = vi.fn(() => result);
  vi.stubGlobal("confirm", confirm);
  return confirm;
};

describe("danger-confirm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects dangerous command text using the shared default patterns", () => {
    expect(isDangerousText("echo ok\nrm -rf /tmp/work")).toBe(true);
    expect(isDangerousText("echo ok")).toBe(false);
  });

  it("confirms dangerous text with the preserved message", () => {
    const confirm = stubConfirm(false);

    expect(confirmDangerousText("rm -rf /tmp/work")).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Dangerous command detected. Send anyway?");
  });

  it("does not confirm safe text", () => {
    const confirm = stubConfirm(false);

    expect(confirmDangerousText("echo ok")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms dangerous keys with the preserved message", () => {
    const confirm = stubConfirm(true);

    expect(confirmDangerousKey("C-c")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Dangerous key detected. Send anyway?");
  });

  it("does not confirm safe keys", () => {
    const confirm = stubConfirm(false);

    expect(confirmDangerousKey("Enter")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
