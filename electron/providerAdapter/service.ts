import crypto from "node:crypto";
import type { LanguageModelV1 } from "ai";
import { buildLanguageModelForVendor } from "../ai/vendorLanguageModel";
import {
  extractVendorExtraHeaders,
  mutateCatalog,
  normalizeProviderKind,
  readCatalog,
} from "../catalog/catalogStore";
import { deriveVendorKeyFromBaseUrl } from "../catalog/catalogCommit";
import { decryptApiKeyRecord } from "../catalog/secrets";
import type { AiSdkProviderKind, BillingModelKind, Model, ProfileKind, Vendor } from "../catalog/types";
import { humanizeModelKey } from "../catalog/modelLabel";
import { AdapterNeedsAiError, compileProviderAdapter, repairProviderAdapter } from "./compiler";
import { discoverProviderDocs, type DiscoveredDocs } from "./docsDiscovery";
import { connectionFingerprint, ProviderAdapterStore, recoverableAdapterRuns } from "./store";
import type {
  AdapterAuthType,
  AdapterModelDraft,
  AdapterModeResult,
  ProviderAdapterCompilation,
  ProviderAdapterCompileFailure,
  ProviderAdapterDraft,
  ProviderAdapterRevision,
  ProviderAdapterRun,
} from "./types";
import { adapterRevisionDigest } from "./validator";
import { verifyAdapterMode, type AdapterVerificationResult } from "./verifier";
import { redactAdapterSecrets } from "./redaction";

export type ProviderAdapterStartInput = {
  vendorName: string;
  baseUrl: string;
  apiKey: string;
  authType: AdapterAuthType;
  providerKind?: AiSdkProviderKind;
  authHeader?: string;
  authQueryParam?: string;
  headers?: Record<string, string>;
  models: Array<{ modelKey: string; labelZh?: string; kind: BillingModelKind }>;
};

type LoadedConnection = {
  vendor: Vendor;
  models: Model[];
  apiKey: string;
  headers?: Record<string, string>;
};

export type ProviderAdapterCatalogPort = {
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

export type ProviderAdapterServiceDependencies = {
  catalog: ProviderAdapterCatalogPort;
  schedule?: (runId: string) => void;
  discover: (input: { baseUrl: string; modelKeys: readonly string[] }) => Promise<DiscoveredDocs>;
  resolveLanguageModels: (connection: LoadedConnection) => readonly LanguageModelV1[];
  compile: (input: {
    languageModels: readonly LanguageModelV1[];
    providerBaseUrl: string;
    authType: AdapterAuthType;
    selectedModels: Array<{ modelKey: string; label: string; kind: BillingModelKind }>;
    docs: DiscoveredDocs["sources"];
  }) => Promise<ProviderAdapterCompilation>;
  repair: (input: {
    languageModels: readonly LanguageModelV1[];
    providerBaseUrl: string;
    selectedModelKeys: readonly string[];
    previousDraft: ProviderAdapterDraft;
    failure: { stage: string; message: string; modelKey?: string; taskKind?: string; requestSummary?: unknown };
    docs: DiscoveredDocs["sources"];
  }) => Promise<ProviderAdapterDraft>;
  verify: (input: {
    vendor: Vendor;
    model: Model;
    apiKey: string;
    mode: ProviderAdapterDraft["models"][number]["modes"][number];
  }) => Promise<AdapterVerificationResult>;
  now: () => string;
  id: () => string;
  maxRepairs?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function adapterModelMetadataForPromotion(input: {
  oldMeta: Record<string, unknown>;
  candidate: AdapterModelDraft;
  modeResults: AdapterModeResult[];
  runId: string;
  revisionId: string;
  updatedAt: string;
}): Record<string, unknown> {
  const verifiedModes = input.modeResults.filter((mode) => mode.state === "verified");
  const failedModes = input.modeResults.filter((mode) => mode.state === "failed");
  const oldAdapter = asRecord(input.oldMeta.adapter);
  const oldActiveRevision = typeof oldAdapter.activeRevision === "string" ? oldAdapter.activeRevision : undefined;
  if (verifiedModes.length === 0) {
    return {
      ...input.oldMeta,
      adapter: {
        state: "failed",
        runId: input.runId,
        ...(oldActiveRevision ? { activeRevision: oldActiveRevision } : {}),
        modes: input.modeResults,
        updatedAt: input.updatedAt,
      },
    };
  }

  const oldImageOptions = asRecord(input.oldMeta.imageOptions);
  const newlyVerifiedReference = verifiedModes.some((mode) => mode.taskKind === "image_edit");
  return {
    ...input.oldMeta,
    ...(input.candidate.parameters ? { parameters: input.candidate.parameters } : {}),
    ...(input.candidate.kind === "image"
      ? {
          imageOptions: {
            ...oldImageOptions,
            supportsReferenceImages: newlyVerifiedReference || oldImageOptions.supportsReferenceImages === true,
          },
        }
      : {}),
    adapter: {
      state: failedModes.length > 0 ? "partial" : "verified",
      runId: input.runId,
      activeRevision: input.revisionId,
      modes: input.modeResults,
      updatedAt: input.updatedAt,
    },
  };
}

function primaryTaskKind(kind: BillingModelKind): ProfileKind {
  if (kind === "image") return "text_to_image";
  if (kind === "video") return "text_to_video";
  if (kind === "audio") return "text_to_audio";
  if (kind === "model3d") return "text_to_3d";
  return "chat";
}

/** 导出仅为单测直接驱动真实 promote（验证结果不得决定 enabled 的不变量钉在那里）。 */
export const defaultCatalog: ProviderAdapterCatalogPort = {
  stage(input) {
    const before = readCatalog();
    const existingVendor = before.vendors.find((vendor) => vendor.key === input.vendorKey);
    const cleanHeaders = Object.fromEntries(
      Object.entries(input.headers || {}).filter(([key, value]) => key.trim() && value.trim()),
    );
    return mutateCatalog((tx) => {
      const vendor = tx.upsertVendor({
        key: input.vendorKey,
        name: input.vendorName || existingVendor?.name || input.vendorKey,
        enabled: existingVendor?.enabled ?? false,
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
      tx.upsertApiKey(input.vendorKey, { apiKey: input.apiKey, enabled: true });
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
          // Last-known-good remains executable; a brand-new candidate stays disabled until one mode passes.
          enabled: existing?.enabled ?? false,
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
    const apiKey = decryptApiKeyRecord(state.apiKeysByVendor[vendorKey]);
    if (vendor.authType !== "none" && !apiKey) return null;
    const selected = new Set(selectedModelKeys);
    const models = state.models.filter((model) => model.vendorKey === vendorKey && selected.has(model.modelKey));
    if (models.length !== selected.size) return null;
    return { vendor, models, apiKey, headers: extractVendorExtraHeaders(vendor) };
  },

  promote(input) {
    const before = readCatalog();
    const verified = new Set(input.verifiedModes.map((item) => `${item.modelKey}\0${item.taskKind}`));
    mutateCatalog((tx) => {
      const existingVendor = before.vendors.find((vendor) => vendor.key === input.run.vendorKey);
      if (!existingVendor) throw new Error(`Provider disappeared before adapter promotion: ${input.run.vendorKey}`);
      // 验证结果不再决定「给不给用」（2026-08-12）：用户明确要求加的东西就该加进来，
      // 没验过的标记出来让他自己试——我们的探测比模型本身更容易错（接 DeepSeek 那次即是）。
      tx.upsertVendor({ ...existingVendor, enabled: true });
      for (const candidate of input.draft.models) {
        const existing = before.models.find(
          (model) => model.vendorKey === input.run.vendorKey && model.modelKey === candidate.modelKey,
        );
        if (!existing) continue;
        const modeResults = input.run.models.find((model) => model.modelKey === candidate.modelKey)?.modes || [];
        const oldMeta = asRecord(existing.meta);
        tx.upsertModel({
          ...existing,
          enabled: true,
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
          if (!verified.has(`${candidate.modelKey}\0${mode.taskKind}`)) continue;
          // Text stays on the existing AI SDK path so streaming remains intact; providerKind is part of the staged vendor.
          if (candidate.kind === "text") continue;
          tx.upsertMapping({
            vendorKey: input.run.vendorKey,
            modelKey: candidate.modelKey,
            taskKind: mode.taskKind,
            name: `${candidate.labelZh} · ${mode.taskKind}`,
            enabled: true,
            create: mode.create,
            ...(mode.query ? { query: mode.query } : {}),
            ...(mode.statusMapping ? { statusMapping: mode.statusMapping } : {}),
          });
        }
      }
      const compiledModels = new Set(input.draft.models.map((model) => model.modelKey));
      for (const resultModel of input.run.models) {
        if (compiledModels.has(resultModel.modelKey)) continue;
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
    mutateCatalog((tx) => {
      for (const resultModel of run.models) {
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

export function prioritizeCompilerCandidates<T extends { vendorKey: string }>(
  candidates: readonly T[],
  targetVendorKey?: string,
): T[] {
  const seenVendors = new Set<string>();
  const firstPerVendor: T[] = [];
  const remaining: T[] = [];
  for (const candidate of candidates) {
    if (seenVendors.has(candidate.vendorKey)) remaining.push(candidate);
    else {
      seenVendors.add(candidate.vendorKey);
      firstPerVendor.push(candidate);
    }
  }
  const prioritized = [...firstPerVendor, ...remaining];
  if (!targetVendorKey) return prioritized;
  return [
    ...prioritized.filter((candidate) => candidate.vendorKey !== targetVendorKey),
    ...prioritized.filter((candidate) => candidate.vendorKey === targetVendorKey),
  ];
}

function defaultResolveLanguageModels(connection: LoadedConnection): LanguageModelV1[] {
  const state = readCatalog();
  const candidates: Array<{ vendorKey: string; modelKey: string; languageModel: LanguageModelV1 }> = [];
  for (const model of state.models) {
    if (model.kind !== "text" || !model.enabled) continue;
    const vendor = state.vendors.find((item) => item.key === model.vendorKey && item.enabled && item.baseUrlHint);
    if (!vendor || (vendor.authType && vendor.authType !== "none" && vendor.authType !== "bearer")) continue;
    const apiKey = vendor.authType === "none" ? "" : decryptApiKeyRecord(state.apiKeysByVendor[vendor.key]);
    if (vendor.authType !== "none" && !apiKey) continue;
    candidates.push({
      vendorKey: vendor.key,
      modelKey: model.modelKey,
      languageModel: buildLanguageModelForVendor(vendor, model, apiKey),
    });
  }
  const selectedText = connection.models.find((model) => model.kind === "text");
  if (selectedText) {
    candidates.push({
      vendorKey: connection.vendor.key,
      modelKey: selectedText.modelKey,
      languageModel: buildLanguageModelForVendor(connection.vendor, selectedText, connection.apiKey),
    });
  }
  const seen = new Set<string>();
  return prioritizeCompilerCandidates(candidates, connection.vendor.key)
    .filter((candidate) => {
      const key = `${candidate.vendorKey}\0${candidate.modelKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((candidate) => candidate.languageModel);
}

const defaultDependencies: ProviderAdapterServiceDependencies = {
  catalog: defaultCatalog,
  discover: ({ baseUrl, modelKeys }) => discoverProviderDocs({ baseUrl, modelKeys }),
  resolveLanguageModels: defaultResolveLanguageModels,
  compile: (input) => compileProviderAdapter(input),
  repair: (input) => repairProviderAdapter(input),
  verify: (input) => verifyAdapterMode(input),
  now: () => new Date().toISOString(),
  id: () => `adapter-run-${crypto.randomUUID()}`,
  maxRepairs: 2,
};

type ModeResultWithModel = AdapterModeResult & { modelKey: string };

export class ProviderAdapterService {
  private readonly dependencies: ProviderAdapterServiceDependencies;
  private readonly active = new Map<string, Promise<void>>();

  constructor(
    private readonly store = new ProviderAdapterStore(),
    dependencies: Partial<ProviderAdapterServiceDependencies> = {},
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  start(rawInput: ProviderAdapterStartInput): ProviderAdapterRun {
    const input = this.normalizeStartInput(rawInput);
    const id = this.dependencies.id();
    const vendorKey = deriveVendorKeyFromBaseUrl(input.baseUrl);
    if (!vendorKey) throw new Error("Unable to derive a provider id from the API base URL");
    const staged = this.dependencies.catalog.stage({ ...input, vendorKey, runId: id });
    const timestamp = this.dependencies.now();
    const run: ProviderAdapterRun = {
      id,
      vendorKey: staged.vendor.key,
      vendorName: staged.vendor.name,
      connectionFingerprint: connectionFingerprint({
        baseUrl: input.baseUrl,
        authType: input.authType,
        apiKey: input.apiKey,
        selectedModelKeys: input.models.map((model) => model.modelKey),
        headers: input.headers,
      }),
      selectedModelKeys: input.models.map((model) => model.modelKey),
      stage: "queued",
      repairAttempt: 0,
      models: input.models.map((model) => ({
        modelKey: model.modelKey,
        labelZh: model.labelZh || humanizeModelKey(model.modelKey),
        kind: model.kind,
        modes: [],
      })),
      sourceUrls: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.upsertRun(run);
    this.schedule(id);
    return run;
  }

  getRun(id: string): ProviderAdapterRun | undefined {
    return this.store.getRun(id);
  }

  latestRun(vendorKey: string): ProviderAdapterRun | undefined {
    return this.store.latestRun(vendorKey);
  }

  resumeInterrupted(): void {
    for (const run of recoverableAdapterRuns(this.store.snapshot().runs)) this.schedule(run.id);
  }

  async executeRun(id: string): Promise<void> {
    const existing = this.active.get(id);
    if (existing) return existing;
    const work = this.process(id).finally(() => this.active.delete(id));
    this.active.set(id, work);
    return work;
  }

  private schedule(id: string): void {
    if (this.dependencies.schedule) this.dependencies.schedule(id);
    else queueMicrotask(() => void this.executeRun(id));
  }

  private async process(id: string): Promise<void> {
    const initial = this.store.getRun(id);
    if (!initial) return;
    if (this.markStaleIfSuperseded(initial)) return;
    const connection = this.dependencies.catalog.load(initial.vendorKey, initial.selectedModelKeys);
    if (!connection) {
      this.finishWithError(id, "failed", "Provider credentials or selected models are no longer available");
      return;
    }
    const fingerprint = connectionFingerprint({
      baseUrl: String(connection.vendor.baseUrlHint || ""),
      authType: connection.vendor.authType || "bearer",
      apiKey: connection.apiKey,
      selectedModelKeys: initial.selectedModelKeys,
      headers: connection.headers,
    });
    if (fingerprint !== initial.connectionFingerprint) {
      this.store.markStaleIfConnectionChanged(id, fingerprint);
      return;
    }

    try {
      this.setStage(id, "discovering_docs");
      const docs = await this.dependencies.discover({
        baseUrl: String(connection.vendor.baseUrlHint || ""),
        modelKeys: initial.selectedModelKeys,
      });
      if (docs.sources.length === 0 || !docs.corpus.trim()) throw new Error("No official API documentation could be discovered on the provider site");
      this.store.updateRun(id, (run) => ({
        ...run,
        sourceUrls: docs.sources.map((source) => source.url),
        updatedAt: this.dependencies.now(),
      }));
      const languageModels = this.dependencies.resolveLanguageModels(connection);
      this.setStage(id, "compiling");
      const selectedModels = connection.models.map((model) => ({
        modelKey: model.modelKey,
        label: model.labelZh,
        kind: model.kind,
      }));
      const compilation = await this.dependencies.compile({
        languageModels,
        providerBaseUrl: String(connection.vendor.baseUrlHint || ""),
        authType: (connection.vendor.authType || "bearer") as AdapterAuthType,
        selectedModels,
        docs: docs.sources,
      });
      let candidate = compilation.draft;
      let results = await this.verifyDraft(id, connection, candidate, 1, compilation.failures);
      const maxRepairs = this.dependencies.maxRepairs ?? 2;
      let repairError: string | undefined;
      // 自动修复重新生成的是「HTTP 接法草稿」，而文本模型的验证走 streamTextTask（生产同一条路）、
      // 压根不读这份草稿——对文本失败重修等于原样再发一次同样的请求，必然同样失败。
      // 旧行为：白转 2 轮、界面还写着「正在根据真实错误自动修复…」（假的），用户干等 2 分钟拿同一个结果。
      // 只让「修得动的」失败（真正按草稿发请求的非文本模型）触发重修。(2026-08-12)
      const repairableKeys = new Set(
        connection.models.filter((model) => model.kind !== "text").map((model) => model.modelKey),
      );
      for (let repairAttempt = 1; repairAttempt <= maxRepairs; repairAttempt += 1) {
        const compiledKeys = new Set(candidate.models.map((model) => model.modelKey));
        const failure = results.find(
          (result) => result.state === "failed" && compiledKeys.has(result.modelKey) && repairableKeys.has(result.modelKey),
        );
        if (!failure) break;
        this.store.updateRun(id, (run) => ({ ...run, stage: "repairing", repairAttempt, updatedAt: this.dependencies.now() }));
        try {
          candidate = await this.dependencies.repair({
            languageModels,
            providerBaseUrl: String(connection.vendor.baseUrlHint || ""),
            selectedModelKeys: candidate.models.map((model) => model.modelKey),
            previousDraft: candidate,
            failure: {
              stage: failure.stage || "create",
              message: failure.error || "Unknown verification failure",
              modelKey: failure.modelKey,
              taskKind: failure.taskKind,
            },
            docs: docs.sources,
          });
        } catch (error) {
          repairError = redactAdapterSecrets(error instanceof Error ? error.message : String(error));
          break;
        }
        // Full regression after every repair: a local fix must not break a mode that previously passed.
        results = await this.verifyDraft(id, connection, candidate, repairAttempt + 1, compilation.failures);
      }
      const compileError = compilation.failures.length
        ? compilation.failures.map((failure) => `${failure.modelKey}: ${failure.error}`).join("; ")
        : undefined;
      await this.promoteFinal(id, candidate, results, [compileError, repairError].filter(Boolean).join("; ") || undefined);
    } catch (error) {
      if (error instanceof AdapterNeedsAiError) this.finishWithError(id, "needs_ai", error.message);
      else this.finishWithError(id, "failed", error instanceof Error ? error.message : String(error));
    }
  }

  private async verifyDraft(
    id: string,
    connection: LoadedConnection,
    draft: ProviderAdapterDraft,
    attempt: number,
    compileFailures: readonly ProviderAdapterCompileFailure[] = [],
  ): Promise<ModeResultWithModel[]> {
    const candidates = new Map(draft.models.map((model) => [model.modelKey, model]));
    const failures = new Map(compileFailures.map((failure) => [failure.modelKey, failure]));
    const emptyModels = connection.models.map((model) => {
      const candidate = candidates.get(model.modelKey);
      const failure = failures.get(model.modelKey);
      return {
        modelKey: model.modelKey,
        labelZh: candidate?.labelZh || model.labelZh,
        kind: model.kind,
        modes: candidate
          ? candidate.modes.map((mode) => ({ taskKind: mode.taskKind, state: "queued" as const, attempts: attempt }))
          : failure
            ? [{
                taskKind: primaryTaskKind(model.kind),
                state: "failed" as const,
                attempts: 1,
                stage: "compile" as const,
                error: failure.error,
              }]
            : [],
      };
    });
    this.store.updateRun(id, (run) => ({ ...run, stage: "testing", models: emptyModels, updatedAt: this.dependencies.now() }));
    const results: ModeResultWithModel[] = compileFailures.map((failure) => {
      const model = connection.models.find((item) => item.modelKey === failure.modelKey);
      return {
        modelKey: failure.modelKey,
        taskKind: primaryTaskKind(model?.kind || "text"),
        state: "failed",
        attempts: 1,
        stage: "compile",
        error: failure.error,
      };
    });
    for (const candidateModel of draft.models) {
      const model = connection.models.find((item) => item.modelKey === candidateModel.modelKey);
      if (!model) throw new Error(`Selected model disappeared during verification: ${candidateModel.modelKey}`);
      for (const mode of candidateModel.modes) {
        this.store.updateRun(id, (run) => ({
          ...run,
          currentModelKey: candidateModel.modelKey,
          models: run.models.map((item) =>
            item.modelKey === candidateModel.modelKey
              ? {
                  ...item,
                  modes: item.modes.map((state) =>
                    state.taskKind === mode.taskKind ? { ...state, state: "testing" } : state,
                  ),
                }
              : item,
          ),
          updatedAt: this.dependencies.now(),
        }));
        const verified = await this.dependencies.verify({ vendor: connection.vendor, model, apiKey: connection.apiKey, mode });
        const modeResult: ModeResultWithModel = verified.ok
          ? {
              modelKey: candidateModel.modelKey,
              taskKind: mode.taskKind,
              state: "verified",
              attempts: attempt,
              verifiedAt: this.dependencies.now(),
            }
          : {
              modelKey: candidateModel.modelKey,
              taskKind: mode.taskKind,
              state: "failed",
              attempts: attempt,
              stage: verified.stage,
              error: verified.error,
            };
        results.push(modeResult);
        const persistedModeResult: AdapterModeResult = {
          taskKind: modeResult.taskKind,
          state: modeResult.state,
          attempts: modeResult.attempts,
          ...(modeResult.stage ? { stage: modeResult.stage } : {}),
          ...(modeResult.error ? { error: modeResult.error } : {}),
          ...(modeResult.verifiedAt ? { verifiedAt: modeResult.verifiedAt } : {}),
        };
        this.store.updateRun(id, (run) => ({
          ...run,
          models: run.models.map((item) =>
            item.modelKey === candidateModel.modelKey
              ? { ...item, modes: item.modes.map((state) => (state.taskKind === mode.taskKind ? persistedModeResult : state)) }
              : item,
          ),
          updatedAt: this.dependencies.now(),
        }));
      }
    }
    return results;
  }

  private async promoteFinal(
    id: string,
    draft: ProviderAdapterDraft,
    results: ModeResultWithModel[],
    repairError?: string,
  ): Promise<void> {
    const current = this.store.getRun(id);
    if (!current || this.markStaleIfSuperseded(current)) return;
    const verifiedModes = results
      .filter((result) => result.state === "verified")
      .map((result) => ({ modelKey: result.modelKey, taskKind: result.taskKind }));
    const digest = adapterRevisionDigest(draft);
    const revision: ProviderAdapterRevision = {
      id: `adapter-revision-${digest.slice(0, 20)}`,
      vendorKey: this.store.getRun(id)?.vendorKey || "",
      digest,
      draft,
      verifiedModes,
      createdAt: this.dependencies.now(),
    };
    const finalStage = verifiedModes.length === 0 ? "failed" : results.some((result) => result.state === "failed") ? "partial" : "completed";
    const run = this.store.updateRun(id, (current) => ({
      ...current,
      stage: finalStage,
      currentModelKey: undefined,
      activeRevision: verifiedModes.length > 0 ? revision.id : current.activeRevision,
      ...(repairError ? { error: repairError.slice(0, 2_000) } : {}),
      updatedAt: this.dependencies.now(),
    }));
    this.dependencies.catalog.promote({ run, draft, revision, verifiedModes });
    if (verifiedModes.length === 0) return;
    this.store.upsertRevision(revision);
  }

  private setStage(id: string, stage: ProviderAdapterRun["stage"]): void {
    this.store.updateRun(id, (run) => ({ ...run, stage, updatedAt: this.dependencies.now() }));
  }

  private finishWithError(id: string, stage: "failed" | "needs_ai", message: string): void {
    const run = this.store.updateRun(id, (current) => {
      const failureStage = current.stage === "discovering_docs" ? "docs" : current.stage === "compiling" ? "compile" : "promote";
      return {
        ...current,
        stage,
        error: redactAdapterSecrets(message),
        currentModelKey: undefined,
        models: current.models.map((model) => ({
          ...model,
          modes: model.modes.length > 0
            ? model.modes
            : [{
                taskKind: primaryTaskKind(model.kind),
                state: "failed" as const,
                attempts: 1,
                stage: failureStage,
                error: redactAdapterSecrets(message),
              }],
        })),
        updatedAt: this.dependencies.now(),
      };
    });
    this.dependencies.catalog.fail(run);
  }

  private markStaleIfSuperseded(run: ProviderAdapterRun): boolean {
    const latest = this.store.latestRun(run.vendorKey);
    if (!latest || latest.id === run.id) return false;
    this.store.updateRun(run.id, (current) => ({
      ...current,
      stage: "stale",
      error: "A newer verification run replaced this result",
      currentModelKey: undefined,
      updatedAt: this.dependencies.now(),
    }));
    return true;
  }

  private normalizeStartInput(input: ProviderAdapterStartInput): ProviderAdapterStartInput {
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Provider base URL must begin with http:// or https://");
    if (input.authType !== "none" && !input.apiKey.trim()) throw new Error("API key is required");
    const seen = new Set<string>();
    const models = input.models
      .map((model) => ({ ...model, modelKey: model.modelKey.trim(), labelZh: model.labelZh?.trim() }))
      .filter((model) => model.modelKey && !seen.has(model.modelKey) && seen.add(model.modelKey));
    if (models.length === 0) throw new Error("Select at least one model to verify");
    return { ...input, baseUrl, apiKey: input.apiKey.trim(), models };
  }
}

let singleton: ProviderAdapterService | null = null;

export function getProviderAdapterService(): ProviderAdapterService {
  singleton ||= new ProviderAdapterService();
  return singleton;
}
