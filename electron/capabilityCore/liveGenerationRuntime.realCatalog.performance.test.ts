import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { applyBuiltinSeeds } from "../catalog/seedBuiltins";
import type { CatalogState } from "../catalog/types";
import { createCatalogModuleRegistry } from "./moduleCatalogBootstrap";
import { createLiveGenerationRuntime } from "./liveGenerationRuntime";

const REAL_SNAPSHOT = JSON.parse(readFileSync(
  new URL("./fixtures/live-generation-runtime.real-33.json", import.meta.url),
  "utf8",
)) as {
  catalog: { version: number; vendors: number; models: number; mappings: number };
  candidates: readonly { moduleId: string; providerId: string; modelId: string; mode: string }[];
  snapshot: readonly unknown[];
};

const emptyCatalog = { version: 1, vendors: [], models: [], mappings: [], apiKeysByVendor: {} } as unknown as CatalogState;
const state = applyBuiltinSeeds(emptyCatalog, "2026-08-26T00:00:00.000Z").state;
const readiness = Object.fromEntries(state.vendors.map((vendor) => [vendor.key, {
  providerReady: true,
  capabilities: { submitIdempotency: false, query: false, reconcile: false, cancel: false },
}]));

function createProbeRuntime() {
  return createLiveGenerationRuntime({
    catalogReader: () => state,
    bootstrap: () => ({ providers: [], readinessByProvider: readiness }),
    registry: (current, currentReadiness) => createCatalogModuleRegistry(current, { readinessByProvider: currentReadiness }),
  });
}

describe("card 12 real built-in catalog performance probe", () => {
  it("keeps the full-catalog 33-shot resolution snapshot byte-identical", () => {
    expect({
      version: state.version,
      vendors: state.vendors.length,
      models: state.models.length,
      mappings: state.mappings.length,
    }).toEqual(REAL_SNAPSHOT.catalog);

    const registry = createProbeRuntime().createDraftScope().registry;
    const resolved = REAL_SNAPSHOT.candidates.map((candidate) => registry.resolve(candidate));
    expect(Buffer.from(JSON.stringify(resolved))).toEqual(Buffer.from(JSON.stringify(REAL_SNAPSHOT.snapshot)));

    for (const count of [8, 16, 33]) {
      const started = performance.now();
      const batch = REAL_SNAPSHOT.candidates.slice(0, count).map((candidate) => registry.resolve(candidate));
      console.info(JSON.stringify({
        probe: "catalog-registry-real",
        shots: count,
        elapsedMs: Number((performance.now() - started).toFixed(3)),
        bytes: Buffer.byteLength(JSON.stringify(batch)),
      }));
    }
  });
});
