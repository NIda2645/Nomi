import type { ExecutionContractV1 } from "../capabilityCore/executionContract";
import type { ProductionRunRepository } from "./productionRunRepository";
import type { ProductionJob, ProductionRun } from "./productionRunTypes";

/** Read-only execution identity. The existing event log is the immutable contract archive. */
export function readGenerationExecution(
  repository: ProductionRunRepository,
  run: ProductionRun,
  input: { shotId?: string; attempt?: number },
): { job: ProductionJob; contract: ExecutionContractV1; currentAuthority: boolean } {
  const matches = run.jobs.filter(job => job.stageId === "generate" && job.metadata?.shotId === input.shotId
    && (input.attempt === undefined || job.attempt === input.attempt));
  const attempt = input.attempt ?? Math.max(0, ...matches.map(job => job.attempt));
  const addressed = matches.filter(job => job.attempt === attempt);
  if (addressed.length !== 1) throw new Error("Generation execution identity is missing or ambiguous");
  const job = addressed[0];
  const fromSnapshot = (snapshot: ProductionRun | undefined): ExecutionContractV1 | undefined => {
    const plan = snapshot?.generationPlan;
    if (!plan || !job.authorizationDigest || plan.authorizationDigest !== job.authorizationDigest) return undefined;
    const authorized = plan.authorizationEnvelope?.jobs.find(entry => entry.jobId === job.jobId && entry.attempt === job.attempt);
    const contract = input.shotId ? plan.shots?.find(shot => shot.shotId === input.shotId)?.contract : plan.contract;
    return authorized && contract?.contractHash === authorized.contractHash ? contract : undefined;
  };
  const current = fromSnapshot(run);
  if (current) return {
    job, contract: current,
    currentAuthority: ["sealed", "submitted"].includes(run.generationPlan!.state)
      && run.gates.some(gate => gate.gateId === run.generationPlan!.authorizationGateId && gate.status === "approved"),
  };
  for (const event of repository.readEvents(run.projectId, run.runId).reverse()) {
    const contract = fromSnapshot(event.payload?.run as ProductionRun | undefined);
    if (contract) return { job, contract, currentAuthority: false };
  }
  throw new Error("Frozen generation execution contract is unavailable");
}
