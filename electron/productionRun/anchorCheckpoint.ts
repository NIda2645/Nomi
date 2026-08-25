import type { ProductionGate } from "./productionRunTypes";

/**
 * P4 S4 — the anchor 亮相检查点 (plan §3.2). A FREE quality gate (not a spend gate) that pauses the
 * batch after the identity/scene anchors have generated, so the user can approve the look before any
 * video shot is paid for. The fact lives in the Run's gate list (never the renderer store), so a crash
 * or a disconnected MCP client cannot lose it; the derivation reads gate.status to release or block shots.
 *
 * The gate carries the anchor jobIds for reference (so the confirmation surface can show the anchor
 * images) but authorizes NO budget — the repository's budget-authorization branch is scoped to
 * `budget_envelope`, so an `anchor_checkpoint` decide never re-authorizes the ledger.
 */

const GATE_PREFIX = "gate-anchor-checkpoint-";

/** The stable, per-run checkpoint gate id. One checkpoint per batch (anchors approved as a set). */
export function anchorCheckpointGateId(runId: string): string {
  return `${GATE_PREFIX}${runId}`;
}

/** Widened to plain strings so projection gates (sanitized JSON) can be tested too, not only durable gates. */
export function isAnchorCheckpointGate(gate: { gateId: string; scope: string }): boolean {
  return gate.scope === "anchor_checkpoint" && gate.gateId.startsWith(GATE_PREFIX);
}

export type BuildAnchorCheckpointGateInput = {
  runId: string;
  planHash: string;
  anchorJobIds: string[];
  now: string;
  /** How long the checkpoint stays open before it expires (default 24h — a decision, not a spend). */
  ttlMs?: number;
};

/**
 * Build the anchor checkpoint gate. Waiting until the user approves the anchor look (or an auto-release
 * timeout, handled in the derivation). The title/summary are the AGENT-FACING gate labels (English, like
 * the sibling direction/contract gates — the renderer owns the user-facing card copy via i18n); they pass
 * the projection sanitizer and carry no internal terms (anchor/seal/materialize) to any surface.
 */
export function buildAnchorCheckpointGate(input: BuildAnchorCheckpointGateInput): ProductionGate {
  const ttlMs = input.ttlMs ?? 24 * 60 * 60 * 1000;
  return {
    gateId: anchorCheckpointGateId(input.runId),
    scope: "anchor_checkpoint",
    status: "waiting",
    planHash: input.planHash,
    jobIds: [...input.anchorJobIds],
    title: "Review the character look before shooting",
    summary: "Nomi generated the lead character and scene references first. Approve the look, then it generates each shot; if a reference is off, regenerate only the reference — the shots are untouched.",
    createdAt: input.now,
    expiresAt: new Date(Date.parse(input.now) + ttlMs).toISOString(),
  };
}
