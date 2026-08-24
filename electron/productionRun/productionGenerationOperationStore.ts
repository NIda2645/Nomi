import type { GenerationOperation, GenerationOperationStore } from "../capabilityCore/mcpGenerationTools";
import type { ExecutionContractV1 } from "../capabilityCore/executionContract";
import type { ProductionRunService } from "./productionRunService";

type GenerationRunOwner = Pick<ProductionRunService, "createGenerationDraft" | "readFull" | "command">;

function operationFromRun(run: ReturnType<ProductionRunService["readFull"]>): GenerationOperation | null {
  const plan = run.generationPlan;
  if (!plan) return null;
  return {
    operationId: plan.operationId,
    projectId: run.projectId,
    candidate: structuredClone(plan.candidate),
    state: plan.state,
    ...(plan.contract ? { contract: structuredClone(plan.contract) } : {}),
    ...(plan.approvedReceiptId ? { approvedReceiptId: plan.approvedReceiptId } : {}),
    // P4 S4: project the multi-shot entries so the MCP gate can build the real display.shots. A
    // single-shot plan has no shots[] → this is omitted and the flat single-shot path is unchanged.
    ...(plan.shots && plan.shots.length > 0
      ? {
          shots: plan.shots.map((shot) => ({
            shotId: shot.shotId,
            ...(shot.role ? { role: shot.role } : {}),
            ...(shot.included !== undefined ? { included: shot.included } : {}),
            candidate: structuredClone(shot.candidate),
            ...(shot.contract ? { contract: structuredClone(shot.contract) } : {}),
          })),
          ...(plan.planHash ? { planHash: plan.planHash } : {}),
          planVersion: run.planVersion,
        }
      : {}),
    updatedAt: plan.updatedAt,
  };
}

/** Durable adapter: the semantic MCP handler talks to ProductionRun, never to a second draft store. */
export function createProductionGenerationOperationStore(owner: GenerationRunOwner): GenerationOperationStore {
  const read = (projectId: string, operationId: string): GenerationOperation => {
    const operation = operationFromRun(owner.readFull(projectId, operationId));
    if (!operation) throw new Error(`Generation operation not found: ${operationId}`);
    return operation;
  };
  return {
    create(input) {
      const run = owner.createGenerationDraft({
        operationId: input.operationId,
        projectId: input.projectId,
        origin: input.origin ?? { host: "semantic-mcp" },
        // A semantic draft is scoped to the verified transport and the exact
        // candidate the user approved.  This is not a provider bypass: the
        // receipt gate still authorizes the single submit, while the Run's
        // policy prevents a later command from changing host/provider/model.
        policy: {
          trustedHosts: [input.origin?.host ?? "semantic-mcp"],
          allowedProviders: [input.candidate.providerId],
          allowedModels: [input.candidate.modelId],
        },
        candidate: input.candidate,
      });
      const operation = operationFromRun(run);
      if (!operation) throw new Error("Production Run did not persist a generation plan");
      return operation;
    },
    read,
    async patch(projectId, operationId, patch, now) {
      const current = read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.patch:${operationId}:${current.candidate.revision}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.patch",
        payload: { patch },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
    async seal(projectId, operationId, contract: ExecutionContractV1, now) {
      read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.seal:${operationId}:${contract.contractHash}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.seal",
        payload: { contract },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
    async cancel(projectId, operationId, now) {
      const current = read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.cancel:${operationId}:${current.state}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.cancel",
        payload: {},
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
    async approve(projectId, operationId, receiptId, now, options) {
      const current = read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.approve:${operationId}:${receiptId}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.approve",
        payload: { receiptId, contractHash: current.contract?.contractHash, ...(options?.attempt === undefined ? {} : { attempt: options.attempt }) },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
    async trialNarrow(projectId, operationId, planHash, now) {
      read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        // commandId includes the target planHash so a retry is idempotent (same narrow → same result).
        commandId: `generation.trial_narrow:${operationId}:${planHash}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.trial_narrow",
        payload: { planHash },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
  };
}

export type ProductionGenerationOperationStore = ReturnType<typeof createProductionGenerationOperationStore>;
