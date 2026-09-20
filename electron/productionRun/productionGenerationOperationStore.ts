import { storyboardContentToken } from '../shared/storyboard/generationPlanEditorial';
import { GenerationOperationNotFoundError, ProductionRunNotFoundError } from './productionRunErrors';
import type { GenerationOperation, GenerationOperationStore } from "../capabilityCore/mcpGenerationTools";
import type { ExecutionContractV1 } from "../capabilityCore/executionContract";
import { generationShotEnvelopeOf } from "../shared/generationShotEnvelope";
import type { ProductionRunService } from "./productionRunService";

type GenerationRunOwner = Pick<ProductionRunService, "createGenerationDraft" | "readFull" | "command">;

function operationFromRun(run: ReturnType<ProductionRunService["readFull"]>): GenerationOperation | null {
  const plan = run.generationPlan;
  if (!plan) return null;
  return {
    operationId: plan.operationId,
    ...(run.origin.sourceDocument ? { sourceDocumentId: run.origin.sourceDocument.documentId } : {}),
    ...(plan.editorial ? { editorial: structuredClone(plan.editorial) } : {}),
    projectId: run.projectId,
    runRevision: run.revision,
    candidate: structuredClone(plan.candidate),
    state: plan.state,
    ...(plan.cardHidden === true ? { cardHidden: true } : {}),
    ...(plan.contract ? { contract: structuredClone(plan.contract) } : {}),
    ...(plan.approvedReceiptId ? { approvedReceiptId: plan.approvedReceiptId } : {}),
    ...(plan.authorizationEnvelope ? { authorizationEnvelope: structuredClone(plan.authorizationEnvelope) } : {}),
    ...(plan.authorizationDigest ? { authorizationDigest: plan.authorizationDigest } : {}),
    ...(plan.authorizationGateId ? { authorizationGateId: plan.authorizationGateId } : {}),
    planVersion: run.planVersion,
    // P4 S4: project the multi-shot entries so the MCP gate can build the real display.shots. A
    // single-shot plan has no shots[] → this is omitted and the flat single-shot path is unchanged.
    ...(plan.shots && plan.shots.length > 0
      ? {
          shots: plan.shots.map((shot) => ({
            ...generationShotEnvelopeOf(shot),
            candidate: structuredClone(shot.candidate),
            ...(shot.contract ? { contract: structuredClone(shot.contract) } : {}),
          })),
          ...(plan.planHash ? { planHash: plan.planHash } : {}),
        }
      : {}),
    updatedAt: plan.updatedAt,
  };
}

/**
 * Draft-lifecycle observers notify the existing projection owner after create or edit. Document
 * plans remain unplaced until explicitly placed; the canvas owner decides whether to project.
 *
 * The hook is fire-and-forget by contract: canvas landing is best-effort (§1 铁律) and must never
 * block or fail a durable draft command.
 */
export type ProductionGenerationOperationStoreHooks = {
  onPlanChanged?: (projectId: string, operationId: string) => void;
};

/** Durable adapter: the semantic MCP handler talks to ProductionRun, never to a second draft store. */
export function createProductionGenerationOperationStore(
  owner: GenerationRunOwner,
  hooks: ProductionGenerationOperationStoreHooks = {},
): GenerationOperationStore {
  // Never let a landing observer's throw surface as a draft-command failure.
  const notifyPlanChanged = (projectId: string, operationId: string): void => {
    if (!hooks.onPlanChanged) return;
    try {
      hooks.onPlanChanged(projectId, operationId);
    } catch {
      // best-effort projection; the durable plan is already committed.
    }
  };
  const read = (projectId: string, operationId: string): GenerationOperation => {
    let run;
    try { run = owner.readFull(projectId, operationId); }
    catch (error) {
      if (error instanceof ProductionRunNotFoundError) throw new GenerationOperationNotFoundError();
      throw error;
    }
    const operation = operationFromRun(run);
    if (!operation) throw new GenerationOperationNotFoundError();
    return operation;
  };
  const assertTarget = (run: ReturnType<GenerationRunOwner['readFull']>, target: Parameters<GenerationOperationStore['patch']>[5]): void => {
    if (target && (target.projectId !== run.projectId || target.targetRunId !== run.runId
      || target.sourceDocumentId !== run.origin.sourceDocument?.documentId
      || target.sourceDocumentRevision !== run.origin.sourceDocument?.revision
      || target.sourceDocumentContentHash !== run.origin.sourceDocument?.contentHash
      || (target.expectedRevision ?? 0) !== run.revision)) throw new Error('storyboard_target_stale');
  };
  return {
    create(input) {
      // P4 S6.5: a multi-shot draft scopes its policy to the UNION of every shot's provider/model (anchor
      // image model + video shot models differ). Without this the Run policy would reject the video shot's
      // model at submit (它不在白名单). A single-shot draft's union is just the one candidate (unchanged).
      const providers = new Set<string>([input.candidate.providerId]);
      const models = new Set<string>([input.candidate.modelId]);
      for (const shot of input.shots ?? []) { providers.add(shot.candidate.providerId); models.add(shot.candidate.modelId); }
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
          allowedProviders: [...providers],
          allowedModels: [...models],
        },
        candidate: input.candidate,
        ...(input.editorial ? { editorial: input.editorial } : {}),
        ...(input.shots && input.shots.length > 0 ? { shots: input.shots } : {}),
        ...(input.cardHidden === true ? { cardHidden: true } : {}),
      });
      const operation = operationFromRun(run);
      if (!operation) throw new Error("Production Run did not persist a generation plan");
      // 建草稿即刻落画布（与「确认即落」「打开项目补齐」共用同一条幂等落地链）。
      notifyPlanChanged(operation.projectId, operation.operationId);
      return operation;
    },
    read,
    async patch(projectId, operationId, patch, now, shotId, target) {
      const current = read(projectId, operationId);
      const targetRun = owner.readFull(projectId, operationId);
      assertTarget(targetRun, target);
      if (targetRun.generationPlan?.editorial) {
        if (!patch.storyboard || !shotId || !targetRun.origin.sourceDocument) throw new Error('storyboard_author_patch_required');
        const plan = structuredClone(targetRun.generationPlan.editorial);
        const authored = patch.storyboard;
        if ('description' in authored) {
          const index = plan.anchors.findIndex(anchor => anchor.id === shotId);
          if (index < 0 || authored.id !== shotId) throw new Error('Storyboard subject mismatch');
          plan.anchors[index] = authored;
        } else {
          const index = plan.shots.findIndex(shot => shot.shotId === shotId);
          if (index < 0 || authored.shotId !== shotId) throw new Error('Storyboard subject mismatch');
          plan.shots[index] = authored;
        }
        const source = targetRun.origin.sourceDocument;
        const result = await owner.command(projectId,operationId,{
          commandId: `generation.author-patch:${operationId}:${targetRun.revision}`,
          expectedRevision:targetRun.revision,type:'generation.save_storyboard',issuedAt:now,
          payload:{projectId,runId:operationId,operationId,sourceDocumentId:source.documentId,sourceDocumentRevision:source.revision,sourceDocumentHash:source.contentHash,
            expectedContentToken:storyboardContentToken(targetRun),plan},
        });
        const operation=operationFromRun(result.run);
        if (!operation) throw new Error('Production Run lost its generation plan');
        notifyPlanChanged(projectId,operationId);
        return operation;
      }
      if (patch.storyboard) throw new Error('storyboard_author_body_required');

      // 改一镜：幂等键跟着**那一镜**的候选 revision 走（reducer 只给那一镜 +1，顶层候选不动——
      // 沿用顶层 revision 会让第二次改同一镜撞上第一次的键、被当成重放吃掉）。
      const targetShot = shotId ? current.shots?.find((shot) => shot.shotId === shotId) : undefined;
      if (shotId && !targetShot) throw new Error(`Generation shot not found: ${shotId}`);
      const result = await owner.command(projectId, operationId, {
        commandId: targetShot
          ? `generation.patch:${operationId}:${shotId}:${targetShot.candidate.revision}`
          : `generation.patch:${operationId}:${current.candidate.revision}`,
        expectedRevision: target ? target.expectedRevision ?? 0 : targetRun.revision,
        type: "generation.patch",
        payload: { patch, ...(shotId ? { shotId } : {}) },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      // 改草稿同样立刻投影：已落的节点按候选 revision 重绑定 prompt/模型（不新建第二条落地链）。
      notifyPlanChanged(operation.projectId, operation.operationId);
      return operation;
    },
    async present(projectId, operationId, now, shotIds, target) {
      read(projectId, operationId);
      const run = owner.readFull(projectId, operationId);
      assertTarget(run, target);
      const revision = run.revision;
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.present:${operationId}:${revision}`,
        expectedRevision: revision,
        type: "generation.present",
        payload: { ...(shotIds === undefined ? {} : { shotIds }) },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      // 卡从「藏着」变「可见」也是一次 plan 变化：面板的报价卡读通道跟着这条事件刷新。
      notifyPlanChanged(operation.projectId, operation.operationId);
      return operation;
    },
    async dismiss(projectId, operationId, now) {
      const revision = owner.readFull(projectId, operationId).revision;
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.dismiss:${operationId}:${revision}`,
        expectedRevision: revision,
        type: "generation.dismiss",
        payload: {},
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      notifyPlanChanged(projectId, operationId);
      return operation;
    },
    async seal(projectId, operationId, contract: ExecutionContractV1, now, multiShot, authorization) {
      read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        // The same creative content may be explicitly approved again in a later batch.
        // Idempotency belongs to this plan version plus frozen content.
        commandId: `generation.seal:${operationId}:v${owner.readFull(projectId, operationId).planVersion}:${multiShot?.planHash ?? contract.contractHash}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.seal",
        // P4 S6.5: forward the per-shot sub-contracts + planHash + derived shotPrices so the reducer
        // freezes the batch and enforces the seal-time hard cap (reducer generation.seal already consumes
        // shots/planHash/shotPrices). Single-shot seal sends only { contract } (byte-identical to today).
        payload: {
          contract,
          ...(multiShot ? { shots: multiShot.shots, planHash: multiShot.planHash, ...(multiShot.shotPrices ? { shotPrices: multiShot.shotPrices } : {}) } : {}),
          ...(authorization ? { authorization } : {}),
        },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
    async cancel(projectId, operationId, now) {
      const current = read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.cancel:${operationId}:v${current.planVersion}:${current.state}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.cancel",
        payload: {},
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
    /**
     * 2026-09-11 付费卡上改参数。`commandId` 带 `planVersion`：改参数是**可重放的用户动作**
     * （用户可能连点两下），幂等键只用 operationId 会把第二次改动吃掉；带上 planVersion 之后，
     * 每一次真的把计划推进一版的改动都有自己的键，而同一版上的重发仍然幂等（同 trial_narrow）。
     */
    async revise(projectId, operationId, input, now) {
      const current = read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.revise:${operationId}:v${current.planVersion}:${current.candidate.revision}:${input.shotId ?? "plan"}`,
        expectedRevision: input.expectedRevision ?? owner.readFull(projectId, operationId).revision,
        type: "generation.revise",
        payload: {
          patch: input.patch,
          ...(input.shotId ? { shotId: input.shotId } : {}),
          ...(input.shotId && typeof input.included === "boolean" ? { included: input.included } : {}),
        },
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      // 改草稿立刻投影回画布：卡上改的提示词/模型必须同步到那份已经落地的草稿节点，
      // 否则「卡上说的」和「画布上的」又分叉成两个账本（同 patch 那条链，不新建第二条）。
      notifyPlanChanged(operation.projectId, operation.operationId);
      return operation;
    },
    async trialNarrow(projectId, operationId, now) {
      const current = read(projectId, operationId);
      const result = await owner.command(projectId, operationId, {
        commandId: `generation.trial_narrow:${operationId}:v${current.planVersion}`,
        expectedRevision: owner.readFull(projectId, operationId).revision,
        type: "generation.trial_narrow",
        payload: {},
        issuedAt: now,
      });
      const operation = operationFromRun(result.run);
      if (!operation) throw new Error("Production Run lost its generation plan");
      return operation;
    },
  };
}

export type ProductionGenerationOperationStore = ReturnType<typeof createProductionGenerationOperationStore>;
