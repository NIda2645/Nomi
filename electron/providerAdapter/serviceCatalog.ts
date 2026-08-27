import {
  extractVendorExtraHeaders,
  mutateCatalog,
  normalizeProviderKind,
  readCatalog,
} from "../catalog/catalogStore";
import { apiKeyDecryptStatus, decryptApiKeyRecord } from "../catalog/secrets";
import type { Model, ProfileKind, Vendor } from "../catalog/types";
import { humanizeModelKey } from "../catalog/modelLabel";
import { modelHasPublishedExecution } from "../shared/modelPublication";
import { adapterModelMetadataForPromotion } from "./promotionMeta";
import type {
  ProviderAdapterDraft,
  ProviderAdapterRegisterInput,
  ProviderAdapterRevision,
  ProviderAdapterRun,
} from "./types";
import type { ProviderAdapterStartInput } from "./service";

export type LoadedConnection = {
  vendor: Vendor;
  models: Model[];
  apiKey: string;
  headers?: Record<string, string>;
};

export type ProviderAdapterCatalogPort = {
  register(input: ProviderAdapterRegisterInput & { vendorKey: string; savedAt: string }): { vendor: Vendor; models: Model[] };
  stage(input: ProviderAdapterStartInput & { vendorKey: string; runId: string }): { vendor: Vendor; models: Model[] };
  load(vendorKey: string, selectedModelKeys: readonly string[]): LoadedConnection | null;
  promote(input: {
    run: ProviderAdapterRun;
    draft: ProviderAdapterDraft;
    revision: ProviderAdapterRevision;
    verifiedModes: Array<{ modelKey: string; taskKind: ProfileKind }>;
  }): void;
  fail(run: ProviderAdapterRun): void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * A model's adapter metadata is the catalog-side lease for a verification run.
 * Terminal work can finish after a newer run has staged the same model, so every
 * catalog write must compare this lease before publishing its result.
 */
function modelOwnedByRun(model: Model, runId: string): boolean {
  const adapter = asRecord(asRecord(model.meta).adapter);
  return adapter.runId === runId;
}

function adapterMetadata(model: Model | undefined): Record<string, unknown> {
  return asRecord(asRecord(model?.meta).adapter);
}

/** Existing published execution survives registration/repair; staged adapter rows do not become active by enabled alone. */
function hasPublishedExecution(state: ReturnType<typeof readCatalog>, model: Model | undefined): boolean {
  return modelHasPublishedExecution(model, {
    mappings: state.mappings,
    legacyWithoutAdapter: "text-only",
  });
}

function vendorHasPublishedExecution(state: ReturnType<typeof readCatalog>, vendorKey: string): boolean {
  return state.models.some((model) => model.vendorKey === vendorKey && hasPublishedExecution(state, model));
}

export const defaultCatalog: ProviderAdapterCatalogPort = {
  register(input) {
    const before = readCatalog();
    const existingVendor = before.vendors.find((vendor) => vendor.key === input.vendorKey);
    const cleanHeaders = Object.fromEntries(
      Object.entries(input.headers || {}).filter(([key, value]) => key.trim() && value.trim()),
    );
    const savedCredential = before.apiKeysByVendor[input.vendorKey];
    if (input.authType !== "none" && input.preserveExistingCredential) {
      if (!savedCredential?.apiKey || savedCredential.enabled === false) {
        throw new Error("The saved connection credential is missing; enter the API key again");
      }
      if (savedCredential.enc !== "safeStorage") {
        throw new Error("The saved connection credential needs to be saved again before authentication can continue");
      }
    }
    const vendorEnabled = vendorHasPublishedExecution(before, input.vendorKey);
    return mutateCatalog((tx) => {
      const vendor = tx.upsertVendor({
        key: input.vendorKey,
        name: input.vendorName || existingVendor?.name || input.vendorKey,
        enabled: vendorEnabled,
        baseUrlHint: input.baseUrl,
        authType: input.authType,
        authHeader: input.authHeader || null,
        authQueryParam: input.authQueryParam || null,
        providerKind: normalizeProviderKind(input.providerKind),
        meta: {
          ...asRecord(existingVendor?.meta),
          ...(Object.keys(cleanHeaders).length ? { extraHeaders: cleanHeaders } : {}),
        },
      });
      if (input.authType === "none") tx.deleteApiKey(input.vendorKey);
      else if (!input.preserveExistingCredential) tx.upsertApiKey(input.vendorKey, { apiKey: input.apiKey, enabled: true });
      const models = input.models.map((selected) => {
        const existing = before.models.find(
          (model) => model.vendorKey === input.vendorKey && model.modelKey === selected.modelKey,
        );
        const oldAdapter = adapterMetadata(existing);
        const canExecute = hasPublishedExecution(before, existing);
        const preserveAdapter = Boolean(existing && canExecute && Object.keys(oldAdapter).length > 0);
        return tx.upsertModel({
          ...(existing || {}),
          vendorKey: input.vendorKey,
          modelKey: selected.modelKey,
          modelAlias: existing?.modelAlias || selected.modelKey,
          labelZh: selected.labelZh || existing?.labelZh || humanizeModelKey(selected.modelKey),
          kind: selected.kind,
          enabled: Boolean(existing?.enabled && canExecute),
          onboarding: existing?.onboarding || { addedVia: "manual", addedAt: input.savedAt, fields: [] },
          meta: canExecute && !preserveAdapter
            ? existing?.meta
            : {
                ...asRecord(existing?.meta),
                adapter: preserveAdapter
                  ? oldAdapter
                  : { state: "unverified", modes: [], updatedAt: input.savedAt },
              },
        });
      });
      return { vendor, models };
    });
  },

  stage(input) {
    const before = readCatalog();
    const existingVendor = before.vendors.find((vendor) => vendor.key === input.vendorKey);
    const cleanHeaders = Object.fromEntries(
      Object.entries(input.headers || {}).filter(([key, value]) => key.trim() && value.trim()),
    );
    const savedCredential = before.apiKeysByVendor[input.vendorKey];
    if (input.authType !== "none" && input.catalogVendorKey && savedCredential?.apiKey && savedCredential.enc !== "safeStorage") {
      throw new Error("The saved connection credential needs to be saved again before authentication can continue");
    }
    const vendorEnabled = vendorHasPublishedExecution(before, input.vendorKey);
    return mutateCatalog((tx) => {
      const vendor = tx.upsertVendor({
        key: input.vendorKey,
        name: input.vendorName || existingVendor?.name || input.vendorKey,
        enabled: vendorEnabled,
        baseUrlHint: input.baseUrl,
        authType: input.authType,
        authHeader: input.authHeader || null,
        authQueryParam: input.authQueryParam || null,
        providerKind: normalizeProviderKind(input.providerKind),
        meta: {
          ...asRecord(existingVendor?.meta),
          ...(Object.keys(cleanHeaders).length ? { extraHeaders: cleanHeaders } : {}),
        },
      });
      if (input.authType === "none") tx.deleteApiKey(input.vendorKey);
      else tx.upsertApiKey(input.vendorKey, { apiKey: input.apiKey, enabled: true });
      const models = input.models.map((selected) => {
        const existing = before.models.find(
          (model) => model.vendorKey === input.vendorKey && model.modelKey === selected.modelKey,
        );
        return tx.upsertModel({
          vendorKey: input.vendorKey,
          modelKey: selected.modelKey,
          modelAlias: existing?.modelAlias || selected.modelKey,
          labelZh: selected.labelZh || existing?.labelZh || humanizeModelKey(selected.modelKey),
          kind: selected.kind,
          enabled: hasPublishedExecution(before, existing),
          meta: {
            ...asRecord(existing?.meta),
            adapter: {
              state: "testing",
              runId: input.runId,
              activeRevision: asRecord(asRecord(existing?.meta).adapter).activeRevision,
              modes: [],
              updatedAt: new Date().toISOString(),
            },
          },
        });
      });
      return { vendor, models };
    });
  },

  load(vendorKey, selectedModelKeys) {
    const state = readCatalog();
    const vendor = state.vendors.find((item) => item.key === vendorKey);
    if (!vendor) return null;
    const credential = state.apiKeysByVendor[vendorKey];
    if (vendor.authType !== "none" && apiKeyDecryptStatus(credential) !== "ok") return null;
    const apiKey = decryptApiKeyRecord(credential);
    const selected = new Set(selectedModelKeys);
    const models = state.models.filter((model) => model.vendorKey === vendorKey && selected.has(model.modelKey));
    if (models.length !== selected.size) return null;
    return { vendor, models, apiKey, headers: extractVendorExtraHeaders(vendor) };
  },

  promote(input) {
    const before = readCatalog();
    const ownedModelKeys = new Set(
      before.models
        .filter((model) => model.vendorKey === input.run.vendorKey && modelOwnedByRun(model, input.run.id))
        .map((model) => model.modelKey),
    );
    // A newer run owns every selected model. The old run is stale even if its
    // caller reached promote after the service-level stale check; do not enable
    // the vendor or publish mappings from that obsolete result.
    if (ownedModelKeys.size === 0) return;
    const verified = new Set(input.verifiedModes.map((item) => `${item.modelKey}\0${item.taskKind}`));
    const vendorEnabled = before.models.some((model) => {
      if (model.vendorKey !== input.run.vendorKey) return false;
      if (hasPublishedExecution(before, model)) return true;
      return ownedModelKeys.has(model.modelKey) && input.verifiedModes.some((mode) => mode.modelKey === model.modelKey);
    });
    mutateCatalog((tx) => {
      const existingVendor = before.vendors.find((vendor) => vendor.key === input.run.vendorKey);
      if (!existingVendor) throw new Error(`Provider disappeared before adapter promotion: ${input.run.vendorKey}`);
      tx.upsertVendor({ ...existingVendor, enabled: vendorEnabled });
      for (const candidate of input.draft.models) {
        if (!ownedModelKeys.has(candidate.modelKey)) continue;
        const existing = before.models.find(
          (model) => model.vendorKey === input.run.vendorKey && model.modelKey === candidate.modelKey,
        );
        if (!existing) continue;
        const modeResults = input.run.models.find((model) => model.modelKey === candidate.modelKey)?.modes || [];
        const oldMeta = asRecord(existing.meta);
        const hasVerifiedMode = input.verifiedModes.some((mode) => mode.modelKey === candidate.modelKey);
        tx.upsertModel({
          ...existing,
          enabled: hasVerifiedMode || hasPublishedExecution(before, existing),
          meta: adapterModelMetadataForPromotion({
            oldMeta,
            candidate,
            modeResults,
            runId: input.run.id,
            revisionId: input.revision.id,
            updatedAt: input.run.updatedAt,
          }),
        });
        for (const mode of candidate.modes) {
          if (candidate.kind === "text") continue;
          const passed = verified.has(`${candidate.modelKey}\0${mode.taskKind}`);
          const existingExact = before.mappings.find(
            (mapping) =>
              mapping.vendorKey === input.run.vendorKey &&
              mapping.modelKey === candidate.modelKey &&
              mapping.taskKind === mode.taskKind,
          );
          if (!passed && existingExact && hasPublishedExecution(before, existing)) continue;
          tx.upsertMapping({
            ...(existingExact || {}),
            vendorKey: input.run.vendorKey,
            modelKey: candidate.modelKey,
            taskKind: mode.taskKind,
            name: `${candidate.labelZh} · ${mode.taskKind}`,
            enabled: passed,
            create: mode.create,
            ...(mode.query ? { query: mode.query } : {}),
            ...(mode.statusMapping ? { statusMapping: mode.statusMapping } : {}),
          });
        }
      }
      const compiledModels = new Set(input.draft.models.map((model) => model.modelKey));
      for (const resultModel of input.run.models) {
        if (compiledModels.has(resultModel.modelKey)) continue;
        if (!ownedModelKeys.has(resultModel.modelKey)) continue;
        const existing = before.models.find(
          (model) => model.vendorKey === input.run.vendorKey && model.modelKey === resultModel.modelKey,
        );
        if (!existing) continue;
        const oldMeta = asRecord(existing.meta);
        tx.upsertModel({
          ...existing,
          meta: {
            ...oldMeta,
            adapter: {
              state: "failed",
              runId: input.run.id,
              activeRevision: asRecord(oldMeta.adapter).activeRevision,
              modes: resultModel.modes,
              updatedAt: input.run.updatedAt,
            },
          },
        });
      }
    });
  },

  fail(run) {
    const before = readCatalog();
    const ownedResults = run.models.filter((resultModel) => {
      const existing = before.models.find(
        (model) => model.vendorKey === run.vendorKey && model.modelKey === resultModel.modelKey,
      );
      return existing ? modelOwnedByRun(existing, run.id) : false;
    });
    if (ownedResults.length === 0) return;
    mutateCatalog((tx) => {
      for (const resultModel of ownedResults) {
        const existing = before.models.find(
          (model) => model.vendorKey === run.vendorKey && model.modelKey === resultModel.modelKey,
        );
        if (!existing) continue;
        const oldMeta = asRecord(existing.meta);
        const oldAdapter = asRecord(oldMeta.adapter);
        tx.upsertModel({
          ...existing,
          meta: {
            ...oldMeta,
            adapter: {
              state: "failed",
              runId: run.id,
              ...(typeof oldAdapter.activeRevision === "string"
                ? { activeRevision: oldAdapter.activeRevision }
                : {}),
              modes: resultModel.modes,
              updatedAt: run.updatedAt,
            },
          },
        });
      }
    });
  },
};
