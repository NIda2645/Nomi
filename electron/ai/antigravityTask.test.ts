import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), probe: vi.fn(), local: vi.fn(), fetch: vi.fn() }));
vi.mock("./antigravityProcess", () => ({ runAntigravityProcess: mocks.run }));
vi.mock("./antigravityConnection", () => ({ probeAntigravity: mocks.probe, antigravityEnvironment: async () => ({}) }));
vi.mock("../assets/localAssetFile", () => ({ readNomiLocalAsset: mocks.local }));
vi.mock("../hardenedFetch", () => ({ hardenedFetch: mocks.fetch }));
import { loadAntigravityImage, runAntigravityTask } from "./antigravityTask";
describe("Antigravity task route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.probe.mockResolvedValue({ version: "1.1.21", models: [{ id: "real-model" }] }); mocks.run.mockResolvedValue({ text: "ok" }); });
  it("validates the selected upstream identity before running", async () => {
    await expect(runAntigravityTask({ prompt: "hello", model: "invented" })).rejects.toThrow("MODEL_UNAVAILABLE");
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("routes local vision bytes with the exact model and cancellation", async () => {
    const bytes = Buffer.from("test"); mocks.local.mockReturnValue({ bytes, contentType: "image/png" });
    const signal = new AbortController().signal;
    await runAntigravityTask({ prompt: "describe", model: "real-model", imageUrls: ["nomi-local://asset"], signal });
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ capability: "vision", model: "real-model", images: [{ bytes, mimeType: "image/png" }], signal, cliVersion: "1.1.21" }), expect.anything());
  });
  it("refuses arbitrary filesystem paths and malformed data", async () => {
    for (const url of ["file:///secret.png", "/secret.png", "data:image/png;base64,%%"])
      await expect(loadAntigravityImage(url)).rejects.toThrow("ANTIGRAVITY_IMAGE_SOURCE_INVALID");
    expect(mocks.local).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("bounds HTTP images and forbids redirects", async () => {
    mocks.fetch.mockResolvedValue({ bytes: Buffer.from("png"), contentType: "image/png; charset=binary" });
    await loadAntigravityImage("https://example.com/image.png");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxBytes: 20971520, allowRedirect: false }));
  });
  it("does not spawn on pre-cancelled input", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runAntigravityTask({ prompt: "hello", model: "auto", signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
    expect(mocks.probe).not.toHaveBeenCalled();
  });
});
