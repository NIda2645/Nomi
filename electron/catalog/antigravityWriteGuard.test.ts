import { expect, it } from "vitest";
import { antigravityImageMappings } from "./antigravityCatalog";
import { guardAntigravityMappingWrite, guardAntigravityModelWrite, guardAntigravityVendorWrite } from "./antigravityWriteGuard";
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
