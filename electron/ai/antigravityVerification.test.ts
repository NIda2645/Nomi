import { expect, it, vi } from "vitest";
import { verifyAntigravityCapability } from "./antigravityVerification";
const base = { text: "OK", conversationId: "test", usage: {} };
it("uses the requested model with a text-only test", async () => {
  const run = vi.fn().mockResolvedValue(base);
  await verifyAntigravityCapability({ capability: "text", modelId: "real-model" }, "1.1.21", new AbortController().signal, run);
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ capability: "text", model: "real-model", cliVersion: "1.1.21" }));
});
it("stages a deterministic visual fixture and requires its correct color", async () => {
  const run = vi.fn().mockResolvedValue({ ...base, text: "BLUE" });
  await expect(verifyAntigravityCapability({ capability: "vision", modelId: "real-model" }, "1.1.21", new AbortController().signal, run))
    .rejects.toThrow("ANTIGRAVITY_TEST_ASSERTION_FAILED");
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ capability: "vision", images: [expect.objectContaining({ mimeType: "image/png" })] }));
});
it.each(["image", "edit"] as const)("does not accept a %s prose response without validated artifacts", async (capability) => {
  await expect(verifyAntigravityCapability({ capability, modelId: "auto" }, "1.1.21", new AbortController().signal, vi.fn().mockResolvedValue(base)))
    .rejects.toThrow("ANTIGRAVITY_TEST_ARTIFACT_MISSING");
});
