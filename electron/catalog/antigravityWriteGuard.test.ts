import { expect, it } from "vitest";
import { guardAntigravityModelWrite, guardAntigravityVendorWrite } from "./antigravityWriteGuard";
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
