import { describe, expect, it } from "vitest";

import {
  ProductionExecutionBindingError,
  createProductionExecutionBinding,
  validateProductionExecutionBinding,
} from "./productionExecutionBinding";

const valid = {
  immutableProjectUuid: "project-uuid-1",
  projectGeneration: 4,
  runId: "run-1",
  shotId: "shot-1",
  contractHash: "a".repeat(64),
  runtimeTaskId: "task-1",
  providerNamespace: "provider.video",
  providerIdempotencyKey: "run-1:shot-1:attempt-1",
  requestFingerprint: "b".repeat(64),
  runtimeEnvelopeRef: ".nomi/runs/run-1/envelopes/task-1.json",
  fencingEpoch: 2,
};

describe("ProductionExecutionBinding", () => {
  it("creates and validates an immutable binding", () => {
    const binding = createProductionExecutionBinding(valid);
    expect(validateProductionExecutionBinding(binding)).toEqual(binding);
  });

  it("rejects a foreign project, malformed hash, or stale fencing epoch", () => {
    expect(() => validateProductionExecutionBinding({ ...valid, immutableProjectUuid: "" })).toThrow(ProductionExecutionBindingError);
    expect(() => validateProductionExecutionBinding({ ...valid, contractHash: "not-a-hash" })).toThrow(ProductionExecutionBindingError);
    expect(() => validateProductionExecutionBinding({ ...valid, fencingEpoch: -1 })).toThrow(ProductionExecutionBindingError);
  });
});

