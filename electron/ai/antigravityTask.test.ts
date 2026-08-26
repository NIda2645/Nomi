import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  run: vi.fn(), probe: vi.fn(), prepare: vi.fn(), local: vi.fn(), fetch: vi.fn(),
  restore: vi.fn(), hasPassed: vi.fn(), readEvidence: vi.fn(),
}));
vi.mock("./antigravityProcess", () => ({ runAntigravityProcess: mocks.run }));
vi.mock("./antigravityConnection", () => ({
  probeAntigravity: mocks.probe,
  prepareAntigravity: mocks.prepare,
  antigravityEnvironment: async () => ({}),
  antigravityConnection: { restore: mocks.restore, hasPassed: mocks.hasPassed },
}));
vi.mock("./antigravityEvidenceStore", () => ({ readAntigravityEvidence: mocks.readEvidence }));
vi.mock("../assets/localAssetFile", () => ({ readNomiLocalAsset: mocks.local }));
vi.mock("../hardenedFetch", () => ({ hardenedFetch: mocks.fetch }));
import { loadAntigravityImage, prepareAntigravityTask, runAntigravityTask } from "./antigravityTask";
import { runPreparedAntigravityTask } from "./antigravityTask";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5foAAAAASUVORK5CYII=", "base64");
describe("Antigravity task route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.probe.mockResolvedValue({ version: "1.1.21", models: [{ id: "real-model" }] });
    mocks.prepare.mockResolvedValue({
      discovery: { version: "1.1.21", models: [{ id: "real-model" }] },
      invocation: { command: "/probe/A/agy", args: [] },
      identity: { realpath: "/probe/A/agy", dev: "1", ino: "2", size: "3", mtimeNs: "4", ctimeNs: "5" },
      env: {},
    });
    mocks.run.mockResolvedValue({ text: "ok" });
    mocks.readEvidence.mockReturnValue([]);
    mocks.hasPassed.mockReturnValue(true);
  });
  it("validates the selected upstream identity before running", async () => {
    await expect(runAntigravityTask({ prompt: "hello", model: "invented" })).rejects.toThrow("MODEL_UNAVAILABLE");
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("routes local vision bytes with the exact model and cancellation", async () => {
    const bytes = png; mocks.local.mockReturnValue({ bytes, contentType: "image/png" });
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
  it.each([
    ["image", "auto"],
    ["edit", "auto"],
    ["vision", "real-model"],
  ] as const)("requires exact current-version historical %s evidence", async (capability, model) => {
    mocks.hasPassed.mockReturnValue(false);
    if (capability !== "image") mocks.local.mockReturnValue({ bytes: png, contentType: "image/png" });
    await expect(runAntigravityTask({ prompt: "hello", model, capability,
      ...(capability === "image" ? {} : { imageUrls: ["nomi-local://asset"] }) })).rejects.toThrow("ANTIGRAVITY_TEST_REQUIRED");
    expect(mocks.restore).toHaveBeenCalledWith([]);
    expect(mocks.hasPassed).toHaveBeenCalledWith({ capability, modelId: model }, "1.1.21");
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("accepts same-model vision evidence for a text task", async () => {
    mocks.hasPassed.mockImplementation((request) => request.capability === "vision" && request.modelId === "real-model");
    await runAntigravityTask({ prompt: "hello", model: "real-model", capability: "text" });
    expect(mocks.hasPassed).toHaveBeenCalledWith({ capability: "text", modelId: "real-model" }, "1.1.21");
    expect(mocks.hasPassed).toHaveBeenCalledWith({ capability: "vision", modelId: "real-model" }, "1.1.21");
    expect(mocks.run).toHaveBeenCalledOnce();
  });
  it("reuses the exact prepared invocation even if later discovery would resolve a different binary", async () => {
    const preflight = await prepareAntigravityTask({ prompt: "hello", model: "real-model", capability: "text" });
    mocks.prepare.mockRejectedValue(new Error("resolver switched to B"));
    await runPreparedAntigravityTask(preflight);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ cliVersion: "1.1.21" }), {
      preparedInvocation: expect.objectContaining({ invocation: { command: "/probe/A/agy", args: [] } }),
    });
  });
});
