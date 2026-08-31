import { expect, it } from "vitest";
import { antigravityImageMappings } from "./antigravityCatalog";
import { guardAntigravityMappingWrite, guardAntigravityModelWrite, guardAntigravityVendorWrite } from "./antigravityWriteGuard";
import type { Mapping } from "./types";
const noProof = () => false;
it("rejects direct and transaction enable attempts without main-process evidence", () => {
  expect(() => guardAntigravityVendorWrite({ key: "antigravity-cli", enabled: true }, undefined, noProof)).toThrow("ANTIGRAVITY_TEST_REQUIRED");
  expect(() => guardAntigravityModelWrite({ vendorKey: "antigravity-cli", modelKey: "made-up", enabled: true }, undefined, noProof)).toThrow("ANTIGRAVITY_TEST_REQUIRED");
});
it("requires the selected model's proof, not another model's successful test", () => {
  const proof = (r?: { modelId: string }) => r?.modelId === "model-a";
  expect(() => guardAntigravityModelWrite({ vendorKey: "antigravity-cli", modelKey: "model-b", enabled: true }, undefined, proof)).toThrow();
  expect(() => guardAntigravityModelWrite({ vendorKey: "antigravity-cli", modelKey: "model-a", enabled: true }, undefined, proof)).not.toThrow();
});
it("allows disabling while refusing arbitrary scripts and Agent-tool claims", () => {
  expect(() => guardAntigravityModelWrite({ vendorKey: "antigravity-cli", modelKey: "auto", enabled: false }, undefined, noProof)).not.toThrow();
  expect(() => guardAntigravityModelWrite({ vendorKey: "antigravity-cli", modelKey: "auto", customCall: { script: "x" } }, undefined, noProof)).toThrow();
  expect(() => guardAntigravityModelWrite({ vendorKey: "antigravity-cli", modelKey: "auto", meta: { supportsToolCalls: true } }, undefined, noProof)).toThrow();
});
it("reserves the Antigravity image parser for canonical mappings even while disabled", () => {
  const mapping = antigravityImageMappings({
    state: "unverified", version: "1.1.21", checkedAt: 1, loginCommand: "agy", models: [], checks: [],
  })[0];
  expect(() => guardAntigravityMappingWrite(mapping, noProof)).not.toThrow();
  expect(() => guardAntigravityMappingWrite({ ...mapping, vendorKey: "attacker" }, noProof)).toThrow("ANTIGRAVITY_INVALID_CONFIG");
  expect(() => guardAntigravityMappingWrite({
    ...mapping,
    create: { ...mapping.create, process: { ...mapping.create.process!, build: "multiframe" } },
  }, noProof)).toThrow("ANTIGRAVITY_INVALID_CONFIG");
});
it("requires exact image/edit proof for enabled canonical mappings", () => {
  const [image, edit] = antigravityImageMappings({
    state: "ready", version: "1.1.21", checkedAt: 1, loginCommand: "agy", models: [], checks: [
      { capability: "image", modelId: "auto", state: "passed", version: "1.1.21", checkedAt: 1 },
      { capability: "edit", modelId: "auto", state: "passed", version: "1.1.21", checkedAt: 1 },
    ],
  });
  const imageOnly = (request?: { capability: string; modelId: string }) => request?.capability === "image" && request.modelId === "auto";
  expect(() => guardAntigravityMappingWrite(image, noProof)).toThrow("ANTIGRAVITY_TEST_REQUIRED");
  expect(() => guardAntigravityMappingWrite(image, imageOnly)).not.toThrow();
  expect(() => guardAntigravityMappingWrite(edit, imageOnly)).toThrow("ANTIGRAVITY_TEST_REQUIRED");
});
it.each([
  ["changed create body", (mapping: ReturnType<typeof antigravityImageMappings>[number]) => ({
    ...mapping, create: { ...mapping.create, body: { prompt: "{{request.params.untrusted}}" } },
  })],
  ["extra create paramMap", (mapping: ReturnType<typeof antigravityImageMappings>[number]) => ({
    ...mapping, create: { ...mapping.create, paramMap: { prompt: { to: "shell" } } },
  })],
  ["query body", (mapping: ReturnType<typeof antigravityImageMappings>[number]) => ({
    ...mapping, query: { ...mapping.query!, body: { prompt: "again" } },
  })],
  ["extra operation field", (mapping: ReturnType<typeof antigravityImageMappings>[number]) => ({
    ...mapping, create: { ...mapping.create, headers: { "X-Untrusted": "1" } },
  })],
  ["changed response mapping", (mapping: ReturnType<typeof antigravityImageMappings>[number]) => ({
    ...mapping, query: { ...mapping.query!, response_mapping: { status: "attacker.status" } },
  })],
])("rejects a canonical-looking mapping with %s", (_name, mutate) => {
  const mapping = antigravityImageMappings({
    state: "unverified", version: "1.1.21", checkedAt: 1, loginCommand: "agy", models: [], checks: [],
  })[0];
  expect(() => guardAntigravityMappingWrite(mutate(mapping) as Mapping, noProof)).toThrow("ANTIGRAVITY_INVALID_CONFIG");
});
it("accepts the exact canonical envelope independent of object key order", () => {
  const mapping = antigravityImageMappings({
    state: "unverified", version: "1.1.21", checkedAt: 1, loginCommand: "agy", models: [], checks: [],
  })[0];
  const create = mapping.create;
  const query = mapping.query!;
  expect(() => guardAntigravityMappingWrite({
    ...mapping,
    create: { response_mapping: create.response_mapping, body: create.body, process: create.process,
      path: create.path, method: create.method },
    query: { response_mapping: query.response_mapping, process: query.process, path: query.path, method: query.method },
  }, noProof)).not.toThrow();
});
