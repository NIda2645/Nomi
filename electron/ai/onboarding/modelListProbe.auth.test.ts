import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModelList } from "./modelListProbe";

afterEach(() => vi.unstubAllGlobals());

describe("fetchModelList saved authentication", () => {
  it("puts query-auth credentials on every candidate URL", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: "model-a" }] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchModelList(
      "openai-compatible",
      "https://api.example.test/v1",
      { "x-gateway": "tenant-a" },
      new AbortController().signal,
      { query: { api_key: "secret-query-key" } },
    );

    expect(result).toMatchObject({ ok: true, models: ["model-a"] });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/v1/models?api_key=secret-query-key",
      expect.objectContaining({ headers: { "x-gateway": "tenant-a" } }),
    );
  });
});
