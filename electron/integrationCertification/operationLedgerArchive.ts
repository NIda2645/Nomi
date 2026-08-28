import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CertificationArchiveRef, CertificationOperationTombstone } from "./types";

type ArchiveFailure = (reason: "corrupt" | "unsupported_version" | "oversized" | "invalid_state", message: string) => Error;

export class CertificationOperationArchive {
  private indexHead?: string;
  private index?: Map<string, CertificationOperationTombstone>;

  constructor(
    private readonly archiveDir: string,
    private readonly maxFileBytes: number,
    private readonly write: (filePath: string, state: unknown) => void,
    private readonly validateTombstone: (raw: unknown) => CertificationOperationTombstone,
    private readonly validateRef: (raw: unknown) => CertificationArchiveRef,
    private readonly fail: ArchiveFailure,
  ) {}

  find(idempotencyHash: string, refs: readonly CertificationArchiveRef[]): CertificationOperationTombstone | undefined {
    this.ensureIndex(refs);
    return this.index!.get(idempotencyHash);
  }

  append(tombstones: CertificationOperationTombstone[], priorRefs: CertificationArchiveRef[]): CertificationArchiveRef {
    if (priorRefs.length <= 1) {
      this.ensureIndex(priorRefs);
      const ref = this.writeSegment(tombstones, priorRefs[0]);
      for (const tombstone of tombstones) this.index!.set(tombstone.idempotencyHash, tombstone);
      this.indexHead = ref.fileName;
      return ref;
    }
    let previous: CertificationArchiveRef | undefined;
    const all = [...this.all(priorRefs), ...tombstones];
    for (let index = 0; index < all.length; index += 250) previous = this.writeSegment(all.slice(index, index + 250), previous);
    return previous!;
  }

  private all(refs: readonly CertificationArchiveRef[]): CertificationOperationTombstone[] {
    this.ensureIndex(refs);
    return [...this.index!.values()];
  }

  private writeSegment(tombstones: CertificationOperationTombstone[], previous?: CertificationArchiveRef): CertificationArchiveRef {
    const payload = { version: 2, tombstones, ...(previous ? { previous } : {}) };
    const sha256 = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const fileName = `segment-${sha256}.json`;
    fs.mkdirSync(this.archiveDir, { recursive: true, mode: 0o700 });
    const target = path.join(this.archiveDir, fileName);
    if (!fs.existsSync(target)) this.write(target, payload);
    return { version: 1, fileName, sha256, count: tombstones.length };
  }

  private ensureIndex(refs: readonly CertificationArchiveRef[]): void {
    const head = refs.length === 1 ? refs[0].fileName : refs.map((ref) => ref.fileName).join(":");
    if (this.indexHead === head && this.index) return;
    const index = new Map<string, CertificationOperationTombstone>();
    if (!refs.length) {
      this.indexHead = head;
      this.index = index;
      return;
    }
    const pending = [...refs];
    const visited = new Set<string>();
    while (pending.length) {
      const ref = pending.pop()!;
      if (visited.has(ref.fileName)) throw this.fail("invalid_state", "Certification archive chain contains a cycle");
      if (visited.size >= 100_000) throw this.fail("oversized", "Certification archive chain is too deep");
      visited.add(ref.fileName);
      const target = path.join(this.archiveDir, ref.fileName);
      if (fs.statSync(target).size > this.maxFileBytes) throw this.fail("oversized", "Certification archive exceeds size limit");
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(target, "utf8")); } catch { throw this.fail("corrupt", "Certification archive is corrupt"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw this.fail("corrupt", "Certification archive is invalid");
      const record = parsed as Record<string, unknown>;
      if (![1, 2].includes(Number(record.version)) || !Array.isArray(record.tombstones)) throw this.fail("unsupported_version", "Unsupported certification archive version");
      const digest = crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
      if (digest !== ref.sha256 || record.tombstones.length !== ref.count) throw this.fail("corrupt", "Certification archive digest mismatch");
      for (const value of record.tombstones) {
        const tombstone = this.validateTombstone(value);
        index.set(tombstone.idempotencyHash, tombstone);
      }
      if (record.version === 2 && record.previous !== undefined) pending.push(this.validateRef(record.previous));
    }
    this.indexHead = head;
    this.index = index;
  }
}
