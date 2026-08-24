import { describe, expect, it } from "vitest";

import { createGenerationContext } from "./generationContext";

describe("GenerationContext", () => {
  it("returns a project-scoped read-only planning packet without side effects", () => {
    const assets = [{ assetId: "asset-a", contentHash: "a".repeat(64), version: 1, kind: "image" }];
    const context = createGenerationContext({
      projectId: "project-1",
      immutableProjectUuid: "project-uuid-1",
      projectGeneration: 4,
      assets,
      providerProfiles: [{ providerId: "provider.image", modelIds: ["model.image.v1"] }],
    });
    expect(context).toMatchObject({ projectId: "project-1", projectGeneration: 4, assets });
    expect(Object.isFrozen(context)).toBe(true);
    expect(() => (context.assets as typeof assets).push({ assetId: "asset-b", contentHash: "b".repeat(64), version: 1, kind: "image" })).toThrow();
  });
});

