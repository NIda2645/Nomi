import { describe, expect, it } from "vitest";

import {
  ModuleManifestValidationError,
  parseModuleManifest,
  type ModuleManifest,
} from "./moduleManifest";

const imageManifest: ModuleManifest = {
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image"],
  modes: ["text-to-image", "image-to-image"],
  parameterSchema: {
    aspectRatio: { type: "string", required: true },
    seed: { type: "integer", required: false },
  },
  assetInputSchema: {
    references: { kind: "image", max: 8, required: false },
  },
  providers: [{
    providerId: "provider.image",
    models: [{
      modelId: "model.image.v1",
      modes: ["text-to-image", "image-to-image"],
      parameterSchema: { aspectRatio: { type: "string" }, seed: { type: "integer" } },
      capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
    }],
  }],
};

describe("moduleManifestSchema", () => {
  it("accepts provider/model-specific parameters without hardcoding a vendor", () => {
    expect(parseModuleManifest(imageManifest)).toEqual(imageManifest);
  });

  it("rejects a provider profile without recovery capabilities", () => {
    const malformed = structuredClone(imageManifest);
    delete (malformed.providers[0].models[0] as { capabilities?: unknown }).capabilities;
    expect(() => parseModuleManifest(malformed)).toThrow(ModuleManifestValidationError);
  });
});
