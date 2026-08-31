import crypto from "node:crypto";
import path from "node:path";
import { capabilityCoreDir, ensureCapabilitySigningKey } from "./security";
import { createProjectLeaseAuthority } from "./projectLease";
import { createProjectLeaseStore } from "./projectLeaseStore";
import { createApprovalReceiptAuthority } from "./approvalReceipt";
import { createProductionRunLock } from "../productionRun/productionRunLock";
import { readWorkspaceProject } from "../workspace/workspaceRepository";
import { createCurrentProjectResolver, deriveProjectIdentityDigests } from "./currentProjectResolver";
import type { ProjectSelectionHandleV1 } from "./projectLease";
import type { DispatchContext } from "./dispatcher";
import { requestRenderer, rendererTargetIdentity } from "./rendererBridge";

type AuthorityHooks = {
  getOpenProjectId: () => string;
  readProject: (projectId: string) => ReturnType<typeof readWorkspaceProject>;
  onTrialFirst?: (input: { projectId: string; operationId: string }) => void | Promise<void>;
};

/** Default project/receipt authorities used by the capability-core runtime.
 * Kept separate from app lifecycle wiring so the app integration module remains
 * an installer rather than a second policy implementation. */
export function createDefaultAuthorities(
  hooks: AuthorityHooks,
): Pick<
  DispatchContext,
  | "projectLeaseAuthority"
  | "resolveProjectSelection"
  | "resolveCurrentProject"
  | "approvalReceiptAuthority"
  | "projectRevisionResolver"
  | "confirmGenerationInNomi"
> {
  const authorityDir = capabilityCoreDir();
  const sharedLock = createProductionRunLock({
    filePath: path.join(authorityDir, "semantic-authorities.lock"),
    epochPath: path.join(authorityDir, "semantic-authorities.epoch"),
    ownerId: `capability-core-${process.pid}`,
  });
  const leaseAuthority = createProjectLeaseAuthority({
    macKey: ensureCapabilitySigningKey("project-lease"),
    keyId: "project-lease-v1",
    store: createProjectLeaseStore({
      filePath: path.join(authorityDir, "project-leases.json"),
      macKey: ensureCapabilitySigningKey("project-lease-store"),
      keyId: "project-lease-store-v1",
      lock: sharedLock,
    }),
  });
  const receiptAuthority = createApprovalReceiptAuthority({
    filePath: path.join(authorityDir, "approval-receipts.json"),
    macKey: ensureCapabilitySigningKey("approval-receipt"),
    storeMacKey: ensureCapabilitySigningKey("approval-receipt-store"),
    keyId: "approval-receipt-v1",
    lock: sharedLock,
  });
  const resolver = createCurrentProjectResolver({
    getOpenProjectId: hooks.getOpenProjectId,
    readProject: hooks.readProject,
  });
  const resolveProjectSelection = (selection: ProjectSelectionHandleV1) => {
    const projectId = hooks.getOpenProjectId().trim();
    const record = projectId ? hooks.readProject(projectId) : null;
    if (
      !record ||
      record.id !== projectId ||
      record.immutableProjectUuid !== selection.immutableProjectUuid ||
      record.projectGeneration !== selection.projectGeneration
    ) {
      throw new Error("Project selection handle does not match the open project");
    }
    const digests = deriveProjectIdentityDigests(record);
    if (
      digests.canonicalRootDigest !== selection.canonicalRootDigest ||
      digests.manifestDigest !== selection.manifestDigest
    ) {
      throw new Error("Project selection handle is stale for the open project");
    }
    return {
      projectId,
      leasePrincipal: "nomi-gui",
      sessionId: `nomi-gui:${selection.sessionNonce}`,
      connectionNonce: selection.sessionNonce,
      serverNonce: crypto.randomUUID(),
    };
  };
  const confirmGenerationInNomi = async ({ challengeToken }: { challengeToken: string }) => {
    const challenge = receiptAuthority.verifyChallenge(challengeToken);
    const target = rendererTargetIdentity();
    if (!target || !challenge.display?.model) return { confirmed: false, challengeId: challenge.challengeId };
    const result = (await requestRenderer(
      "generation.gate.confirm",
      {
        challengeId: challenge.challengeId,
        projectName: challenge.display.projectName,
        shotSummary: challenge.display.shotSummary,
        model: challenge.display.model,
        referenceCount: challenge.display.referenceCount,
        maximumCost: challenge.reservationPreview.maximum,
        currency: challenge.reservationPreview.currency,
        expiresAt: challenge.expiresAt,
        ...(challenge.display.shots ? { shots: challenge.display.shots } : {}),
      },
      60_000,
    )) as { confirmed?: unknown; trialFirst?: unknown } | null;
    if (result?.confirmed !== true) {
      if (result?.trialFirst === true && hooks.onTrialFirst && challenge.runId && challenge.projectId) {
        try {
          await hooks.onTrialFirst({ projectId: challenge.projectId, operationId: challenge.runId });
        } catch (error) {
          console.error(
            "[nomi:capability-core] trial-first narrow failed:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      return {
        confirmed: false,
        challengeId: challenge.challengeId,
        ...(result?.trialFirst === true ? { trialFirst: true } : {}),
      };
    }
    const attestation = receiptAuthority.createMainProcessGestureAttestation(challengeToken, {
      ...target,
      decision: "accept",
    });
    const receipt = receiptAuthority.mintReceipt(challengeToken, attestation);
    return {
      confirmed: true,
      challengeId: challenge.challengeId,
      receiptId: receipt.receipt.receiptId,
      receiptToken: receipt.token,
    };
  };
  return {
    projectLeaseAuthority: leaseAuthority,
    resolveProjectSelection,
    resolveCurrentProject: resolver,
    approvalReceiptAuthority: receiptAuthority,
    confirmGenerationInNomi,
    projectRevisionResolver: (projectId) => hooks.readProject(projectId)?.revision,
  };
}
