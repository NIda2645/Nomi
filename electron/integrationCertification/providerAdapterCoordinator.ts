import crypto from "node:crypto";
import type { ProfileKind } from "../catalog/types";
import type { AdapterVerificationResult } from "../providerAdapter/verifier";
import { redactAdapterSecrets } from "../providerAdapter/redaction";
import { adapterRunLineageRoot } from "../providerAdapter/serviceRunLifecycle";
import type { ProviderAdapterCatalogPort, ProviderAdapterPromotionResult } from "../providerAdapter/serviceCatalog";
import type { ProviderAdapterStore } from "../providerAdapter/store";
import type {
  ProviderAdapterConnectionInput,
  ProviderAdapterDraft,
  ProviderAdapterRevision,
  ProviderAdapterRun,
} from "../providerAdapter/types";
import { OperationLedger } from "./operationLedger";
import { PromotionJournal } from "./promotionJournal";
import type { CertificationContractBinding, CertificationOperationRecord } from "./types";

export class AdapterReconciliationRequiredError extends Error {
  constructor() {
    super("Provider submission status is unknown and must be reconciled before any retry");
    this.name = "AdapterReconciliationRequiredError";
  }
}

function inputDigest(input: ProviderAdapterConnectionInput): string {
  const normalized = {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    authType: input.authType,
    authHeader: input.authHeader || null,
    authQueryParam: input.authQueryParam || null,
    providerKind: input.providerKind || null,
    headerDigest: crypto.createHash("sha256").update(JSON.stringify(Object.entries(input.headers || {}).sort())).digest("hex"),
    models: input.models.map((model) => ({ modelKey: model.modelKey, kind: model.kind })).sort((a, b) => a.modelKey.localeCompare(b.modelKey)),
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function effectiveContractDigest(input: ProviderAdapterConnectionInput, binding?: CertificationContractBinding): string {
  const actualDigest = inputDigest(input);
  if (!binding) return actualDigest;
  if (!/^[a-f0-9]{64}$/.test(binding.contractDigest)) throw new Error("Certification contract digest must be a SHA-256 digest");
  if (!binding.idempotencyKey.trim() || binding.idempotencyKey.length > 256 || /[\r\n]/.test(binding.idempotencyKey)) {
    throw new Error("Certification idempotency key is invalid");
  }
  return crypto.createHash("sha256").update(`${binding.contractDigest}:${actualDigest}`).digest("hex");
}

export class ProviderAdapterCertificationCoordinator {
  readonly ledger: OperationLedger;
  private readonly journal: PromotionJournal;

  constructor(
    private readonly store: ProviderAdapterStore,
    private readonly catalog: ProviderAdapterCatalogPort,
    private readonly now: () => string,
    dependencies: { operationLedger?: OperationLedger; promotionJournal?: PromotionJournal } = {},
  ) {
    this.ledger = dependencies.operationLedger
      || new OperationLedger(store.integrationCertificationPath("operations.json"));
    this.journal = dependencies.promotionJournal
      || new PromotionJournal(store.integrationCertificationPath("promotion-journal.json"));
  }

  prepareStart(input: ProviderAdapterConnectionInput, runId: string, lineageRoot: string): {
    duplicate?: ProviderAdapterRun;
    contractDigest: string;
    idempotencyKey: string;
  } {
    const binding = input.certification;
    const idempotencyKey = binding?.idempotencyKey || `legacy-${runId}`;
    const contractDigest = effectiveContractDigest(input, binding);
    const duplicate = this.ledger.getByIdempotencyKey(idempotencyKey);
    if (duplicate) {
      if (duplicate.contractDigest !== contractDigest) throw new Error("The idempotency key is already bound to a different contract");
      const original = this.store.getRun(duplicate.runId);
      if (!original) throw new Error("Certification ledger references a missing canonical run");
      return { duplicate: original, contractDigest, idempotencyKey };
    }
    const unresolved = this.ledger.snapshot().operations.find((operation) =>
      operation.lineageRootVendorKey === lineageRoot
      && ["submitting", "submitted", "unknown"].includes(operation.submissionState)
      && !["finalized", "cancelled", "superseded"].includes(operation.checkpoint),
    );
    if (unresolved) throw new Error("This provider already has an unresolved remote submission; reconcile it before starting another certification");
    return { contractDigest, idempotencyKey };
  }

  begin(input: {
    runId: string;
    contractDigest: string;
    idempotencyKey: string;
    lineageRootVendorKey: string;
    remoteIdempotency: CertificationContractBinding["remoteIdempotency"] | undefined;
    now: string;
  }): void {
    this.ledger.begin({
      runId: input.runId,
      contractDigest: input.contractDigest,
      idempotencyKey: input.idempotencyKey,
      lineageRootVendorKey: input.lineageRootVendorKey,
      leaseOwner: input.runId,
      leaseToken: crypto.randomUUID(),
      attempt: 1,
      childRunRef: { runId: input.runId, revisionDigest: input.contractDigest },
      providerIdempotency: input.remoteIdempotency || "unknown",
      now: input.now,
    });
  }

  cancelBeforeRemoteSettlement(runId: string): boolean {
    const operation = this.ledger.getByRunId(runId);
    if (!operation) return true;
    try {
      this.ledger.cancel(runId, {
        expectedRevision: operation.revision,
        leaseToken: operation.lease.token,
        now: this.now(),
      });
      return true;
    } catch {
      this.markSubmissionUnknown(runId, "submission_unknown");
      return false;
    }
  }

  resumeDisposition(run: ProviderAdapterRun, canReconcile: boolean): "schedule" | "wait" {
    let operation = this.ledger.getByRunId(run.id);
    if (operation?.submissionState === "submitting") {
      operation = this.ledger.markUnknown(run.id, {
        expectedRevision: operation.revision,
        userAction: "reconcile_or_contact_provider",
        now: this.now(),
      });
    }
    if (operation?.submissionState === "submitted" || operation?.submissionState === "unknown") {
      this.markSubmissionUnknown(run.id, operation.remoteTaskId ? "submission_unknown" : "submission_reconcile_unavailable");
      return operation.remoteTaskId && canReconcile ? "schedule" : "wait";
    }
    return "schedule";
  }

  async executeSubmission(input: {
    runId: string;
    operationKey: string;
    beforeSubmit?: () => void;
    execute: () => Promise<AdapterVerificationResult>;
    reconcile?: (remoteTaskId: string) => Promise<AdapterVerificationResult>;
    reuse: (operation: CertificationOperationRecord) => AdapterVerificationResult;
    isUncertainError: (error: unknown) => boolean;
  }): Promise<AdapterVerificationResult> {
    let operation = this.ledger.getByRunId(input.runId);
    if (!operation) throw new Error("Certification operation ledger entry is missing");
    try {
      let result: AdapterVerificationResult;
      if (operation.submissionState === "unknown" || operation.submissionState === "submitted") {
        if (!operation.remoteTaskId || !input.reconcile) {
          this.markSubmissionUnknown(input.runId, operation.remoteTaskId ? "submission_unknown" : "submission_reconcile_unavailable");
          throw new AdapterReconciliationRequiredError();
        }
        if (operation.submissionState === "unknown") {
          operation = this.ledger.markReconciled(input.runId, {
            remoteTaskId: operation.remoteTaskId,
            expectedRevision: operation.revision,
            now: this.now(),
          });
        }
        result = await input.reconcile(operation.remoteTaskId!);
      } else if (operation.submissionState === "settled" && operation.operationKey === input.operationKey) {
        result = input.reuse(operation);
      } else {
        input.beforeSubmit?.();
        operation = this.ledger.markSubmitting(input.runId, {
          operationKey: input.operationKey,
          providerIdempotency: operation.providerIdempotency,
          expectedRevision: operation.revision,
          now: this.now(),
        });
        result = await input.execute();
      }
      operation = this.ledger.getByRunId(input.runId)!;
      const unknown = result.submissionState === "unknown"
        || (!result.ok && (result.stage === "create" || result.stage === "poll")
          && (result.errorCategory === "network" || result.errorCategory === "timeout"));
      if (unknown) {
        if (operation.submissionState === "submitting" || operation.submissionState === "submitted") {
          this.ledger.markUnknown(input.runId, {
            expectedRevision: operation.revision,
            userAction: "reconcile_or_contact_provider",
            ...(result.remoteTaskId ? { remoteTaskId: result.remoteTaskId } : {}),
            now: this.now(),
          });
        }
        this.markSubmissionUnknown(input.runId, result.remoteTaskId ? "submission_unknown" : "submission_reconcile_unavailable");
        throw new AdapterReconciliationRequiredError();
      }
      if (operation.submissionState === "submitting" && result.remoteTaskId) {
        operation = this.ledger.markSubmitted(input.runId, {
          remoteTaskId: result.remoteTaskId,
          expectedRevision: operation.revision,
          now: this.now(),
        });
      }
      if (operation.submissionState === "submitting" || operation.submissionState === "submitted") {
        this.ledger.markSettled(input.runId, {
          expectedRevision: operation.revision,
          ...(result.ok && result.mediaEvidence ? { artifactEvidence: result.mediaEvidence } : {}),
          now: this.now(),
        });
      }
      return result;
    } catch (error) {
      if (error instanceof AdapterReconciliationRequiredError) throw error;
      const inFlight = this.ledger.getByRunId(input.runId);
      if (input.isUncertainError(error) && (inFlight?.submissionState === "submitting" || inFlight?.submissionState === "submitted")) {
        this.ledger.markUnknown(input.runId, {
          expectedRevision: inFlight.revision,
          userAction: "reconcile_or_contact_provider",
          ...(inFlight.remoteTaskId ? { remoteTaskId: inFlight.remoteTaskId } : {}),
          now: this.now(),
        });
        this.markSubmissionUnknown(input.runId, inFlight.remoteTaskId ? "submission_unknown" : "submission_reconcile_unavailable");
        throw new AdapterReconciliationRequiredError();
      }
      throw error;
    }
  }

  finishWithoutPromotion(run: ProviderAdapterRun): void {
    const operation = this.ledger.getByRunId(run.id);
    if (operation && !["cancelled", "superseded"].includes(operation.checkpoint)) {
      this.ledger.markCheckpoint(run.id, { checkpoint: "finalized", expectedRevision: operation.revision, now: this.now() });
    }
  }

  commitPromotion(input: {
    current: ProviderAdapterRun;
    completedRun: ProviderAdapterRun;
    draft: ProviderAdapterDraft;
    revision: ProviderAdapterRevision;
    verifiedModes: Array<{ modelKey: string; taskKind: ProfileKind }>;
  }): void {
    const operation = this.ledger.getByRunId(input.current.id);
    if (!operation) throw new Error("Certification operation ledger entry is missing before promotion");
    if (input.completedRun.error) {
      this.store.updateRun(input.current.id, (run) => ({ ...run, error: redactAdapterSecrets(input.completedRun.error || "") }));
    }
    this.store.upsertRevision(input.revision);
    this.journal.prepare({
      journalId: `promotion-${input.current.id}`,
      runId: input.current.id,
      lineageRootVendorKey: adapterRunLineageRoot(input.current),
      leaseToken: operation.lease.token,
      ...(input.current.activeRevision ? { expectedActiveRevision: input.current.activeRevision } : {}),
      proposedRevisionId: input.revision.id,
      contractDigest: operation.contractDigest,
      verifiedModes: input.verifiedModes,
      childRunRef: { runId: input.current.id, revisionDigest: input.revision.digest },
      terminalStage: input.completedRun.stage === "partial" ? "partial" : "completed",
      now: this.now(),
    });
    this.ledger.markCheckpoint(input.current.id, {
      checkpoint: "promotion_prepared",
      expectedRevision: operation.revision,
      now: this.now(),
    });
    this.replayPromotions();
    const entry = this.journal.get(`promotion-${input.current.id}`);
    if (entry?.state === "aborted") {
      const staleRun: ProviderAdapterRun = {
        ...input.completedRun,
        stage: "stale",
        activeRevision: entry.expectedActiveRevision,
        error: "A newer verification run replaced this result before promotion committed",
      };
      this.catalog.fail(staleRun);
      this.store.upsertRun(staleRun);
      this.store.deleteRevision(input.revision.id);
      const latest = this.ledger.getByRunId(input.current.id);
      if (latest && latest.checkpoint !== "superseded") {
        this.ledger.markCheckpoint(input.current.id, { checkpoint: "superseded", expectedRevision: latest.revision, now: this.now() });
      }
    }
  }

  replayPromotions(): void {
    this.journal.replay({
      commitCatalog: (entry): ProviderAdapterPromotionResult => {
        const run = this.store.getRun(entry.runId);
        const revision = this.store.getRevision(entry.proposedRevisionId);
        if (!run || !revision) throw new Error("Prepared promotion references missing durable run state");
        return this.catalog.promote({
          run: { ...run, stage: entry.terminalStage || "completed", currentModelKey: undefined, activeRevision: entry.proposedRevisionId },
          draft: revision.draft,
          revision,
          verifiedModes: entry.verifiedModes,
        });
      },
      finalizeRun: (entry) => {
        const run = this.store.getRun(entry.runId);
        const revision = this.store.getRevision(entry.proposedRevisionId);
        if (!run || !revision) throw new Error("Committed promotion references missing durable run state");
        const finalizedAt = this.now();
        this.store.upsertRevision({ ...revision, verifiedModes: entry.verifiedModes });
        this.store.upsertRun({
          ...run,
          stage: entry.terminalStage || "completed",
          currentModelKey: undefined,
          completedCount: run.totalCount ?? run.selectedModelKeys.length,
          activeRevision: entry.proposedRevisionId,
          recovery: undefined,
          stageStartedAt: finalizedAt,
          lastProgressAt: finalizedAt,
          updatedAt: finalizedAt,
        });
        let operation = this.ledger.getByRunId(entry.runId);
        if (operation?.checkpoint === "promotion_prepared") {
          operation = this.ledger.markCheckpoint(entry.runId, { checkpoint: "promotion_committed", expectedRevision: operation.revision, now: finalizedAt });
        }
        if (operation && operation.checkpoint !== "finalized") {
          this.ledger.markCheckpoint(entry.runId, { checkpoint: "finalized", expectedRevision: operation.revision, now: finalizedAt });
        }
      },
      now: this.now,
    });
  }

  markSubmissionUnknown(runId: string, reasonCode: "submission_unknown" | "submission_reconcile_unavailable"): ProviderAdapterRun | undefined {
    const current = this.store.getRun(runId);
    if (!current) return current;
    const updatedAt = this.now();
    return this.store.updateRun(runId, (run) => ({
      ...run,
      stage: "reconciling",
      error: "Provider submission status is unknown. Nomi will not create another task automatically.",
      recovery: { reasonCode, userAction: "reconcile_or_contact_provider" },
      stageStartedAt: updatedAt,
      lastProgressAt: updatedAt,
      updatedAt,
    }));
  }
}
