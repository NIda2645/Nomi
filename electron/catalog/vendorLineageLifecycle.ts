import { nowIso } from "../jsonUtils";
import { derivePublishedExecution } from "../shared/modelPublication";
import { candidateSourceVendorKey } from "./stagedVendorIdentity";
import type { CatalogState } from "./types";

export function vendorLineageClosure(state: CatalogState, rootKey: string): Set<string> {
  const keys = new Set([rootKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const vendor of state.vendors) {
      if (keys.has(vendor.key) || !keys.has(candidateSourceVendorKey(vendor.meta))) continue;
      keys.add(vendor.key);
      changed = true;
    }
  }
  return keys;
}

export function removeVendorLineage(state: CatalogState, rootKey: string): void {
  const keys = vendorLineageClosure(state, rootKey);
  state.vendors = state.vendors.filter((vendor) => !keys.has(vendor.key));
  state.models = state.models.filter((model) => !keys.has(model.vendorKey));
  state.mappings = state.mappings.filter((mapping) => !keys.has(mapping.vendorKey));
  for (const key of keys) delete state.apiKeysByVendor[key];
}

export function restoreSourceAfterCandidateDeletion(state: CatalogState, candidateKey: string): void {
  const candidate = state.vendors.find((vendor) => vendor.key === candidateKey);
  const sourceVendorKey = candidateSourceVendorKey(candidate?.meta);
  if (!sourceVendorKey) return;
  const sourceVendor = state.vendors.find((vendor) => vendor.key === sourceVendorKey);
  if (!sourceVendor) return;

  const deleting = vendorLineageClosure(state, candidateKey);
  const published = state.models.filter((model) =>
    deleting.has(model.vendorKey) && derivePublishedExecution(model, { mappings: state.mappings }).published,
  );
  if (published.length === 0) return;
  const publishedKeys = new Set(published.map((model) => model.modelKey));
  const publishedModes = new Set(published.flatMap((model) =>
    derivePublishedExecution(model, { mappings: state.mappings }).publishedModes
      .map((taskKind) => `${model.modelKey}\0${taskKind}`),
  ));
  const restoredAt = nowIso();
  let restored = false;
  state.models = state.models.map((model) => {
    if (model.vendorKey !== sourceVendorKey || !publishedKeys.has(model.modelKey)) return model;
    restored = true;
    return { ...model, enabled: true, updatedAt: restoredAt };
  });
  state.mappings = state.mappings.map((mapping) => {
    if (
      mapping.vendorKey !== sourceVendorKey ||
      !mapping.modelKey ||
      !publishedModes.has(`${mapping.modelKey}\0${mapping.taskKind}`)
    ) return mapping;
    return { ...mapping, enabled: true, updatedAt: restoredAt };
  });
  if (restored) {
    state.vendors = state.vendors.map((vendor) =>
      vendor.key === sourceVendorKey ? { ...vendor, enabled: true, updatedAt: restoredAt } : vendor,
    );
  }
}
