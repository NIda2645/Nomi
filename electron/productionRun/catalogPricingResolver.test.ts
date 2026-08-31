import { describe, expect, it } from "vitest";

import type { Model } from "../catalog/types";
import type { ExecutionContractV1 } from "../capabilityCore/executionContract";
import { createCatalogModelPricingResolver, createCatalogShotPriceResolver } from "./catalogPricingResolver";

// P4 S2: the runtime bridge from catalog rows to the pure derive. Resolves by vendorKey + modelKey/alias
// (candidate.providerId = vendorKey, candidate.modelId = modelKey), adapts Model.pricing, never fabricates.

function model(overrides: Partial<Model> = {}): Model {
  return {
    modelKey: "seedance-2.5",
    vendorKey: "apimart",
    modelAlias: null,
    labelZh: "Seedance",
    kind: "video",
    enabled: true,
    pricing: { cost: 12, enabled: true, specCosts: [{ specKey: "720p", cost: 3, enabled: true }] },
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  };
}

function contract(overrides: Partial<ExecutionContractV1> = {}): ExecutionContractV1 {
  return {
    schemaVersion: 1,
    candidateId: "c1",
    candidateRevision: 1,
    moduleId: "generation.single-shot",
    moduleVersion: "1.0.0",
    providerId: "apimart",
    modelId: "seedance-2.5",
    mode: "text-to-video",
    prompt: "a boat",
    parameters: { resolution: "720p" },
    references: [],
    contractHash: "hash",
    warnings: [],
    droppedFields: [],
    ...overrides,
  };
}

describe("createCatalogModelPricingResolver", () => {
  it("resolves pricing by vendorKey + modelKey (case-insensitive)", () => {
    const resolve = createCatalogModelPricingResolver([model()]);
    expect(resolve("APIMART", "Seedance-2.5")).toEqual({ cost: 12, enabled: true, specCosts: [{ specKey: "720p", cost: 3, enabled: true }] });
  });

  it("resolves pricing by modelAlias when modelKey does not match", () => {
    const resolve = createCatalogModelPricingResolver([model({ modelKey: "internal-key", modelAlias: "seedance-2.5" })]);
    expect(resolve("apimart", "seedance-2.5")?.cost).toBe(12);
  });

  it("returns undefined when no row matches (→ pure derive reports unknown)", () => {
    const resolve = createCatalogModelPricingResolver([model()]);
    expect(resolve("apimart", "no-such-model")).toBeUndefined();
  });

  it("returns undefined when the matched row has no pricing", () => {
    const resolve = createCatalogModelPricingResolver([model({ pricing: undefined })]);
    expect(resolve("apimart", "seedance-2.5")).toBeUndefined();
  });
});

describe("createCatalogShotPriceResolver", () => {
  it("derives a known per-shot price from a sealed contract + catalog pricing", () => {
    const resolve = createCatalogShotPriceResolver([model()]);
    // base 12 + matched specCost 3 (bare "720p" matches parameters.resolution) = 15.
    expect(resolve(contract())).toEqual({ known: true, amount: 15 });
  });

  it("is unknown when the contract's model has no catalog pricing", () => {
    const resolve = createCatalogShotPriceResolver([model({ pricing: undefined })]);
    expect(resolve(contract())).toEqual({ known: false });
  });
});
