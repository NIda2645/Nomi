import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionRunIntentLog } from "./productionRunIntentLog";
import { createProductionRunLock } from "./productionRunLock";
import { createProductionRunRepository } from "./productionRunRepository";
import { createProductionRunRuntimeEnvelope } from "./productionRunRuntimeEnvelope";
import { SubmissionReceiptUnknownError } from "./submissionOutbox";
import { createRunOwnedGenerationSubmission } from "./generationSubmission";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-generation-submission-"));
  tempDirs.push(root);
  const repository = createProductionRunRepository({
    projectDirResolver: (projectId) => projectId === "project-1" ? root : null,
    now: () => "2026-08-23T00:00:00.000Z",
    randomId: (() => { let id = 0; return () => `id-${++id}`; })(),
  });
  repository.create({
    runId: "run-1", projectId: "project-1", playbook: { name: "brand.promo", version: "1.0.0" }, origin: { host: "codex" }, brief: { goal: "single-shot fixture" },
    policy: { trustedHosts: ["codex"], allowedProviders: ["provider.image"], allowedModels: ["model.image.v1"], maxSpend: 20, maxAttemptsPerJob: 1 },
  });
  repository.execute("project-1", "run-1", {
    commandId: "job", expectedRevision: 0, type: "job.add", issuedAt: "2026-08-23T00:00:00.000Z",
    payload: { job: { jobId: "job-1", stageId: "generate", status: "authorized", attempt: 1, provider: "provider.image", model: "model.image.v1", idempotencyKey: "run-1:job-1:1", createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z" } },
  });
  repository.execute("project-1", "run-1", {
    commandId: "approval", expectedRevision: 1, type: "approval.record", issuedAt: "2026-08-23T00:00:00.000Z",
    payload: { approval: { approvalId: "approval-1", runId: "run-1", scope: "job_set", planHash: "plan-1", jobIds: ["job-1"], allowedProviders: ["provider.image"], allowedModels: ["model.image.v1"], currency: "CNY", maxSpend: 10, maxAttemptsPerJob: 1, decidedAt: "2026-08-23T00:00:00.000Z", expiresAt: "2026-08-23T01:00:00.000Z" } },
  });
  repository.execute("project-1", "run-1", {
    commandId: "authorization", expectedRevision: 2, type: "budget.entry", issuedAt: "2026-08-23T00:00:00.000Z",
    payload: { entry: { billingEntryId: "authorization", kind: "authorize", amount: 10, occurredAt: "2026-08-23T00:00:00.000Z" } },
  });
  const intentLog = createProductionRunIntentLog({ filePath: path.join(root, "intents.ndjson"), macKey: "intent-key", now: () => "2026-08-23T00:00:00.000Z", randomId: () => "intent-1" });
  const lock = createProductionRunLock({ filePath: path.join(root, "run.lock"), epochPath: path.join(root, "run.lock.epoch"), ownerId: "owner-1", now: () => "2026-08-23T00:00:00.000Z", randomId: () => "lock-1" });
  const envelope = createProductionRunRuntimeEnvelope({ filePath: path.join(root, "envelope.json"), now: () => "2026-08-23T00:00:00.000Z" });
  return { root, repository, intentLog, lock, envelope };
}

const request = { projectId: "project-1", runId: "run-1", jobId: "job-1", approvalId: "approval-1", planHash: "plan-1", costCeiling: 5, currency: "CNY" };
const envelopeInput = { runId: "run-1", jobId: "job-1", runtimeTaskId: "task-1", contractHash: "a".repeat(64), providerIdempotencyKey: "run-1:job-1:1", requestFingerprint: "b".repeat(64), request: { providerId: "provider.image", modelId: "model.image.v1", prompt: "fox" } };

describe("Run-owned generation submission wiring", () => {
  it("seals the envelope before dispatch and records acceptance before the outbox settles the job", async () => {
    const { repository, intentLog, lock, envelope } = setup();
    const dispatch = vi.fn(async () => {
      expect(envelope.read()?.state).toBe("sealed");
      return { providerTaskId: "provider-task-1" };
    });
    const submission = createRunOwnedGenerationSubmission({ repository, dispatch, intentLog, lock, envelopeFor: () => envelope, now: () => "2026-08-23T00:00:00.000Z" });
    await expect(submission.submit({ request, envelope: envelopeInput })).resolves.toMatchObject({ providerTaskId: "provider-task-1" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(envelope.read()).toMatchObject({ state: "provider_accepted", providerTaskId: "provider-task-1" });
    expect(repository.read("project-1", "run-1")?.jobs[0]).toMatchObject({ status: "provider_accepted", providerTaskId: "provider-task-1" });
  });

  it("marks the envelope unknown and blocks a second submit after an ambiguous provider result", async () => {
    const { repository, intentLog, lock, envelope } = setup();
    const dispatch = vi.fn(async () => { throw new SubmissionReceiptUnknownError(); });
    const submission = createRunOwnedGenerationSubmission({ repository, dispatch, intentLog, lock, envelopeFor: () => envelope, now: () => "2026-08-23T00:00:00.000Z" });
    await expect(submission.submit({ request, envelope: envelopeInput })).rejects.toThrow(SubmissionReceiptUnknownError);
    expect(envelope.read()).toMatchObject({ state: "submitted_unknown" });
    await expect(submission.submit({ request, envelope: envelopeInput })).rejects.toThrow(/reconciliation/i);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

