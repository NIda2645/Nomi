import crypto from "node:crypto";

export const ADAPTER_CANDIDATE_SOURCE_VENDOR_KEY = "adapterCandidateSourceVendorKey";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Stable, opaque identity for an unverified connection revision. */
export function stagedVendorKey(sourceVendorKey: string, connection: unknown): string {
  const digest = crypto.createHash("sha256")
    .update(JSON.stringify(canonical(connection)))
    .digest("hex")
    .slice(0, 12);
  return `${sourceVendorKey}--candidate-${digest}`;
}

export function candidateSourceVendorKey(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const value = (meta as Record<string, unknown>)[ADAPTER_CANDIDATE_SOURCE_VENDOR_KEY];
  return typeof value === "string" ? value.trim() : "";
}
