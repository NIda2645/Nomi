import { describe, expect, it } from "vitest";
import { projectAntigravityModels, antigravityImageMappings } from "./antigravityCatalog";
import type { AntigravityConnectionStatus } from "../shared/antigravity";

const status: AntigravityConnectionStatus = {
  state: "unverified", checkedAt: 1, loginCommand: "agy", version: "1.1.21",
  models: [{ id: "gemini-3.7-flash-low", label: "Gemini 3.7 Flash (Low)" }], checks: [],
};
describe("Antigravity discovered catalog", () => {
  it("does not inherit the old unverified automatic placeholder's enabled flag", () => {
    const legacy = { ...projectAntigravityModels(status, [])[0], enabled: true, meta: { supportsToolCalls: false } };
    expect(projectAntigravityModels(status, [legacy])[0].enabled).toBe(false);
  });
  it("lists exact discovered text IDs and separates automatic selection and image tool identities", () => {
    const models = projectAntigravityModels(status, []);
    expect(models.map((m) => m.modelKey)).toEqual(["auto", "gemini-3.7-flash-low", "generate_image"]);
    expect(models.every((m) => !m.enabled)).toBe(true);
    expect(models[1]).toMatchObject({ labelZh: status.models[0].label, kind: "text", meta: { supportsToolCalls: false, supportsImageInput: false } });
    expect(models[2]).toMatchObject({ kind: "image", meta: { antigravityKind: "tool" } });
  });
  it("preserves a deliberate model disable and name after successful verification", () => {
    const before = projectAntigravityModels(status, []);
    before[1].labelZh = "My Flash";
    const next = projectAntigravityModels({ ...status, checks: [{ capability: "vision", modelId: before[1].modelKey,
      state: "passed", checkedAt: 2, version: "1.1.21" }] }, before);
    expect(next[1]).toMatchObject({ labelZh: "My Flash", enabled: false, meta: { supportsImageInput: true } });
    expect(next[0].meta).toMatchObject({ supportsImageInput: false });
  });
  it("does not grant reference-image support from text or image-generation success", () => {
    const models = projectAntigravityModels({ ...status, checks: [{ capability: "image", modelId: "auto",
      state: "passed", checkedAt: 2, version: "1.1.21" }] }, []);
    expect(models[2].meta).toMatchObject({ supportsReferenceImages: false });
    expect(models[2].enabled).toBe(false);
  });
  it("does not discover a catalog of fake models when CLI discovery failed", () => {
    expect(projectAntigravityModels({ ...status, state: "error", models: [] }, [])).toEqual([]);
  });
  it("keeps image modes independently gated and declares the reference transport", () => {
    const mappings = antigravityImageMappings({ ...status, checks: [{ capability: "image", modelId: "auto", state: "passed", version: "1.1.21", checkedAt: 2 }] });
    expect(mappings[0]).toMatchObject({ enabled: true, taskKind: "text_to_image", create: { process: { parser: "antigravity-cli-image" } } });
    expect(mappings[1]).toMatchObject({ enabled: false, taskKind: "image_edit", create: { body: { reference_images: "{{request.params.reference_images}}" } } });
  });
});
