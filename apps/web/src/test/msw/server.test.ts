import { describe, expect, it } from "vitest";

import { HttpResponse, http, server } from "./server";

describe("msw server", () => {
  it("intercepts fetch requests", async () => {
    server.use(
      http.get("https://example.test/ping", () => {
        return HttpResponse.json({ ok: true });
      }),
    );

    const res = await fetch("https://example.test/ping");
    const data = (await res.json()) as { ok: boolean };

    expect(data).toEqual({ ok: true });
  });
});
