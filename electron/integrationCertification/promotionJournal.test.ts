import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CertificationPersistenceError } from "./operationLedger";
import { PromotionJournal, type PromotionJournalWrite } from "./promotionJournal";

const roots: string[] = [];

function createJournal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-promotion-journal-"));
  roots.push(root);
  const filePath = path.join(root, "promotion-journal.json");
  return { filePath, journal: new PromotionJournal(filePath) };
}

function preparedInput() {
  return {
    journalId: "promotion-run-1",
    runId: "run-1",
    lineageRootVendorKey: "api-example-com",
    leaseToken: "lease-1",
    expectedActiveRevision: "adapter-revision-old",
    proposedRevisionId: "adapter-revision-new",
    contractDigest: "a".repeat(64),
    verifiedModes: [{ modelKey: "paint-v2", taskKind: "text_to_image" as const }],
    childRunRef: { runId: "run-1", revisionDigest: "b".repeat(64) },
    now: "2026-08-28T00:00:00.000Z",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("PromotionJournal", () => {
  it("replays prepared catalog promotion and run finalization exactly once", () => {
    const { journal, filePath } = createJournal();
    journal.prepare(preparedInput());
    const commitCatalog = vi.fn(() => ({ status: "committed" as const, committedModes: preparedInput().verifiedModes }));
    const finalizeRun = vi.fn();

    new PromotionJournal(filePath).replay({ commitCatalog, finalizeRun, now: () => "2026-08-28T00:00:01.000Z" });
    new PromotionJournal(filePath).replay({ commitCatalog, finalizeRun, now: () => "2026-08-28T00:00:02.000Z" });

    expect(commitCatalog).toHaveBeenCalledTimes(1);
    expect(finalizeRun).toHaveBeenCalledTimes(1);
    expect(new PromotionJournal(filePath).get("promotion-run-1")?.state).toBe("committed");
  });

  it("stops at every durable journal checkpoint and resumes from that checkpoint", () => {
    const { journal, filePath } = createJournal();
    journal.prepare(preparedInput());
    journal.markCatalogCommitted("promotion-run-1", {
      expectedRevision: 1,
      committedModes: preparedInput().verifiedModes,
      now: "2026-08-28T00:00:01.000Z",
    });
    expect(new PromotionJournal(filePath).get("promotion-run-1")?.state).toBe("catalog_committed");

    const commitCatalog = vi.fn();
    const finalizeRun = vi.fn();
    new PromotionJournal(filePath).replay({ commitCatalog, finalizeRun, now: () => "2026-08-28T00:00:02.000Z" });

    expect(commitCatalog).not.toHaveBeenCalled();
    expect(finalizeRun).toHaveBeenCalledTimes(1);
    expect(new PromotionJournal(filePath).get("promotion-run-1")?.state).toBe("committed");
  });

  it("aborts on lease/CAS loss and preserves the previous active revision", () => {
    const { journal } = createJournal();
    journal.prepare(preparedInput());
    const finalizeRun = vi.fn();

    journal.replay({
      commitCatalog: () => ({ status: "no-lease" as const }),
      finalizeRun,
      now: () => "2026-08-28T00:00:01.000Z",
    });

    expect(finalizeRun).not.toHaveBeenCalled();
    expect(journal.get("promotion-run-1")).toMatchObject({
      state: "aborted",
      expectedActiveRevision: "adapter-revision-old",
      userAction: "review_newer_certification",
    });
  });

  it("fails closed instead of treating a corrupt or future journal as empty", () => {
    const { filePath } = createJournal();
    for (const payload of ["{", JSON.stringify({ version: 99, entries: [] })]) {
      fs.writeFileSync(filePath, payload, "utf8");
      expect(() => new PromotionJournal(filePath)).toThrowError(CertificationPersistenceError);
    }
  });

  it("keeps a prepared promotion invisible when its durable write fails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-promotion-write-fail-"));
    roots.push(root);
    const write: PromotionJournalWrite = () => {
      throw new Error("simulated journal rename failure");
    };
    const journal = new PromotionJournal(path.join(root, "journal.json"), { write });

    expect(() => journal.prepare(preparedInput())).toThrowError(/rename/);
    expect(journal.get("promotion-run-1")).toBeUndefined();
  });
});
