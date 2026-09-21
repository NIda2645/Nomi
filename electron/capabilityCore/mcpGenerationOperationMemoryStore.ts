import { generationShotEnvelopeOf } from "../shared/generationShotEnvelope";
import { resolveGenerationShotScope } from "../shared/agentCapabilities/generationShotScope";
import { applyPlanCandidatePatch } from "./executionContract";
import type { GenerationOperation, GenerationOperationStore } from "./mcpGenerationTools";

/**
 * 只给测试与夹具用的内存版草稿存储（从 mcpGenerationTools.ts 抽出，守 800 行门岗 R9）。
 *
 * 生产装配一律用 Run 拥有的那一份（`productionGenerationOperationStore.ts`）。这份住在这里而不是
 * 测试目录：它实现的是同一个 `GenerationOperationStore` 契约，契约变了它必须跟着红。
 */
function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return value;
}

/** Test/fixture store only. Production wiring must supply a Run-owned durable store. */
export function createInMemoryGenerationOperationStore(): GenerationOperationStore {
  const operations = new Map<string, GenerationOperation>();
  const keyFor = (projectId: string, operationId: string) => `${projectId}:${operationId}`;
  const read = (projectId: string, operationId: string) => operations.get(keyFor(projectId, operationId)) ?? null;
  return {
    create(input) {
      const key = keyFor(input.projectId, input.operationId);
      if (operations.has(key)) throw new Error(`Generation operation already exists: ${input.operationId}`);
      const operation = freeze({
        operationId: input.operationId,
        projectId: input.projectId,
        candidate: structuredClone(input.candidate),
        ...(input.origin?.sourceDocument ? {sourceDocumentId:input.origin.sourceDocument.documentId} : {}),
        state: "draft" as const,
        ...(input.cardHidden === true ? { cardHidden: true } : {}),
        // P4 S6.5: seed draft shots (candidate/role/included, no sub-contract). Single-shot omits shots.
        ...(input.shots && input.shots.length > 0
          ? { shots: input.shots.map((shot) => ({ ...generationShotEnvelopeOf(shot), candidate: structuredClone(shot.candidate) })) }
          : {}),
        updatedAt: input.now,
      });
      operations.set(key, operation);
      return operation;
    },
    read,
    patch(projectId, operationId, patch, now, shotId) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state !== "draft") throw new Error("new_draft_required: edit a new generation draft");
      if (shotId) {
        if (!current.shots?.some((shot) => shot.shotId === shotId)) throw new Error(`Generation shot not found: ${shotId}`);
        const shots = current.shots.map((shot) => shot.shotId === shotId ? { ...shot, candidate: applyPlanCandidatePatch(shot.candidate, patch) } : shot);
        const next = freeze({ ...current, shots, updatedAt: now });
        operations.set(keyFor(projectId, operationId), next);
        return next;
      }
      const candidate = applyPlanCandidatePatch(current.candidate, patch);
      const next = freeze({ ...current, candidate, updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
    present(projectId, operationId, now, shotIds) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state !== "draft") throw new Error("new_draft_required: only a draft can be presented");
      const { cardHidden: _cardHidden, ...visible } = current;
      const scope = resolveGenerationShotScope(current.shots?.map((shot) => shot.shotId) ?? [current.candidate.candidateId], shotIds);
      const next = freeze({ ...visible,
        ...(current.shots ? { shots: current.shots.map((shot) => ({ ...shot, included: scope.includes(shot.shotId) })) } : {}),
        planVersion: (current.planVersion ?? 0) + 1, updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
    seal(projectId, operationId, contract, now, multiShot, authorization) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state === "sealed" && current.contract?.contractHash === contract.contractHash) return current;
      if (current.state !== "draft") throw new Error("Generation operation is not editable");
      const next = freeze({
        ...current,
        candidate: { ...current.candidate, sealedContractHash: contract.contractHash },
        contract,
        state: "sealed" as const,
        // P4 S6.5: freeze the multi-shot bundle (per-shot sub-contracts + plan hash) exactly as the durable
        // reducer does. The gate projection reads these; a single-shot seal omits them (unchanged).
        ...(multiShot ? { shots: multiShot.shots.map((shot) => ({ ...shot, candidate: { ...shot.candidate } })), planHash: multiShot.planHash } : {}),
        ...(authorization
          ? {
              authorizationEnvelope: structuredClone(authorization.envelope),
              authorizationDigest: authorization.authorizationDigest,
              authorizationGateId: authorization.envelope.gateId,
              planHash: authorization.authorizationDigest,
            }
          : {}),
        updatedAt: now,
      });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
    cancel(projectId, operationId, now, reason) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state === "submitted") throw new Error("Submitted generation cannot be cancelled as a draft");
      const next = freeze({ ...current, state: "cancelled" as const, ...(reason ? { cancelReason: reason } : {}), updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
  };
}
