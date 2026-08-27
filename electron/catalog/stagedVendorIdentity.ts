import crypto from "node:crypto";
import { modelHasPublishedExecution } from "../shared/modelPublication";
import type { CatalogState, Vendor } from "./types";

export const ADAPTER_CANDIDATE_SOURCE_VENDOR_KEY = "adapterCandidateSourceVendorKey";
export const ADAPTER_CANDIDATE_ROOT_VENDOR_KEY = "adapterCandidateRootVendorKey";
export const ADAPTER_CANDIDATE_REVISION_ID = "adapterCandidateRevisionId";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Opaque candidate identity. The revision id makes equal connection settings distinct saves/runs. */
export function stagedVendorKey(rootVendorKey: string, connection: unknown, revisionId = "legacy"): string {
  const digest = crypto.createHash("sha256")
    .update(JSON.stringify(canonical({ connection, revisionId })))
    .digest("hex")
    .slice(0, 16);
  return `${rootVendorKey}--candidate-${digest}`;
}

export function newCandidateRevisionId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function candidateSourceVendorKey(meta: unknown): string {
  return text(record(meta)?.[ADAPTER_CANDIDATE_SOURCE_VENDOR_KEY]);
}

export function candidateRootVendorKey(meta: unknown): string {
  return text(record(meta)?.[ADAPTER_CANDIDATE_ROOT_VENDOR_KEY]);
}

export function candidateRevisionId(meta: unknown): string {
  return text(record(meta)?.[ADAPTER_CANDIDATE_REVISION_ID]);
}

export function isCandidateVendor(vendor: Pick<Vendor, "meta"> | null | undefined): boolean {
  return Boolean(candidateSourceVendorKey(vendor?.meta));
}

function lineageRoot(state: CatalogState, vendorKey: string): string {
  let current = vendorKey;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const vendor = state.vendors.find((item) => item.key === current);
    const explicitRoot = candidateRootVendorKey(vendor?.meta);
    if (explicitRoot) return explicitRoot;
    const source = candidateSourceVendorKey(vendor?.meta);
    if (!source) return current;
    current = source;
  }
  return vendorKey;
}

export function resolvedCandidateRootVendorKey(state: CatalogState, vendorKey: string): string {
  return lineageRoot(state, vendorKey);
}

function modelPublished(state: CatalogState, vendorKey: string, selected: ReadonlySet<string>): boolean {
  return state.models.some((model) =>
    model.vendorKey === vendorKey &&
    (selected.size === 0 || selected.has(model.modelKey)) &&
    modelHasPublishedExecution(model, { mappings: state.mappings }),
  );
}

function vendorPublished(state: CatalogState, vendorKey: string): boolean {
  return modelPublished(state, vendorKey, new Set());
}

function lineageVendors(state: CatalogState, rootVendorKey: string): Vendor[] {
  return state.vendors.filter((vendor) =>
    vendor.key === rootVendorKey || lineageRoot(state, vendor.key) === rootVendorKey,
  );
}

export type StagedVendorIdentity = {
  vendorKey: string;
  isolated: boolean;
  sourceVendorKey: string;
  rootVendorKey: string;
  revisionId: string;
  supersededVendorKeys: string[];
};

/**
 * Allocate one candidate revision without deriving identity from secret material.
 * A stage may reuse the exact unpublished registration row it was handed; every
 * new save/run against published execution receives a distinct sibling revision.
 */
export function planStagedVendorIdentity(input: {
  state: CatalogState;
  sourceVendorKey: string;
  connection: unknown;
  revisionId: string;
  selectedModelKeys: readonly string[];
  reuseUnpublishedCandidate: boolean;
}): StagedVendorIdentity {
  const sourceVendorKey = input.sourceVendorKey;
  const sourceVendor = input.state.vendors.find((vendor) => vendor.key === sourceVendorKey);
  const rootVendorKey = lineageRoot(input.state, sourceVendorKey);
  const selected = new Set(input.selectedModelKeys);
  const lineage = lineageVendors(input.state, rootVendorKey);

  const sameRevision = input.reuseUnpublishedCandidate
    ? lineage.find((vendor) =>
        isCandidateVendor(vendor) &&
        candidateRevisionId(vendor.meta) === input.revisionId &&
        !vendorPublished(input.state, vendor.key),
      )
    : undefined;
  if (sameRevision) {
    return {
      vendorKey: sameRevision.key,
      isolated: true,
      sourceVendorKey: candidateSourceVendorKey(sameRevision.meta),
      rootVendorKey,
      revisionId: input.revisionId,
      supersededVendorKeys: [],
    };
  }

  if (
    input.reuseUnpublishedCandidate &&
    isCandidateVendor(sourceVendor) &&
    !vendorPublished(input.state, sourceVendorKey)
  ) {
    return {
      vendorKey: sourceVendorKey,
      isolated: true,
      sourceVendorKey: candidateSourceVendorKey(sourceVendor?.meta),
      rootVendorKey,
      revisionId: candidateRevisionId(sourceVendor?.meta) || input.revisionId,
      supersededVendorKeys: [],
    };
  }

  const publishedSelected = lineage
    .filter((vendor) => modelPublished(input.state, vendor.key, selected))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const publishedSource = vendorPublished(input.state, sourceVendorKey) ? sourceVendor : undefined;
  const activeSource = publishedSelected || publishedSource;
  const hasPublishedLineage = lineage.some((vendor) => vendorPublished(input.state, vendor.key));

  // First-time, unpublished onboarding keeps the stable source key. Isolation starts
  // once there is active execution or the caller explicitly supersedes a candidate.
  if (!hasPublishedLineage && !isCandidateVendor(sourceVendor)) {
    return {
      vendorKey: sourceVendorKey,
      isolated: false,
      sourceVendorKey,
      rootVendorKey,
      revisionId: input.revisionId,
      supersededVendorKeys: [],
    };
  }

  const immediateSourceVendorKey = activeSource?.key || candidateSourceVendorKey(sourceVendor?.meta) || sourceVendorKey;
  let vendorKey = stagedVendorKey(rootVendorKey, input.connection, input.revisionId);
  let suffix = 2;
  while (input.state.vendors.some((vendor) => vendor.key === vendorKey)) {
    vendorKey = `${stagedVendorKey(rootVendorKey, input.connection, input.revisionId)}-${suffix}`;
    suffix += 1;
  }
  const supersededVendorKeys = lineage
    .filter((vendor) => isCandidateVendor(vendor) && vendor.key !== vendorKey && !vendorPublished(input.state, vendor.key))
    .map((vendor) => vendor.key);
  return {
    vendorKey,
    isolated: true,
    sourceVendorKey: immediateSourceVendorKey,
    rootVendorKey,
    revisionId: input.revisionId,
    supersededVendorKeys,
  };
}

export function candidateLineageMeta(identity: StagedVendorIdentity): Record<string, string> {
  return identity.isolated
    ? {
        [ADAPTER_CANDIDATE_SOURCE_VENDOR_KEY]: identity.sourceVendorKey,
        [ADAPTER_CANDIDATE_ROOT_VENDOR_KEY]: identity.rootVendorKey,
        [ADAPTER_CANDIDATE_REVISION_ID]: identity.revisionId,
      }
    : {};
}
