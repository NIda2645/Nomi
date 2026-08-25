import { describe, expect, it } from "vitest";

import { createModuleRegistry, ModuleRegistryError } from "./moduleRegistry";
import type { ModuleManifest } from "./moduleManifest";

const manifests: ModuleManifest[] = [{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text"],
  outputKinds: ["video"],
  modes: ["text-to-video"],
  parameterSchema: { duration: { type: "number", required: true } },
  assetInputSchema: {},
  providers: [{
    providerId: "provider.video",
    models: [{
      modelId: "model.video.v1",
      modes: ["text-to-video"],
      parameterSchema: { duration: { type: "number", required: true }, fps: { type: "integer" } },
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
}];

describe("ModuleRegistry", () => {
  it("resolves a declared provider/model/mode and freezes the snapshot", () => {
    const registry = createModuleRegistry(manifests);
    expect(registry.resolve({ moduleId: "generation.single-shot", providerId: "provider.video", modelId: "model.video.v1", mode: "text-to-video" })).toMatchObject({
      moduleId: "generation.single-shot",
      providerId: "provider.video",
      modelId: "model.video.v1",
      mode: "text-to-video",
    });
    expect(Object.isFrozen(registry.snapshot()[0])).toBe(true);
  });

  it("fails closed for unknown model or unsupported mode", () => {
    const registry = createModuleRegistry(manifests);
    expect(() => registry.resolve({ moduleId: "generation.single-shot", providerId: "provider.video", modelId: "missing", mode: "text-to-video" })).toThrow(ModuleRegistryError);
    expect(() => registry.resolve({ moduleId: "generation.single-shot", providerId: "provider.video", modelId: "model.video.v1", mode: "image-to-image" })).toThrow(ModuleRegistryError);
  });
});

