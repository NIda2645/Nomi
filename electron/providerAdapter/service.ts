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
import { buildOpenAiCompatibleDraft, builtinDraftForUndocumentedEndpoint } from "./builtinOpenAiCompatibleDraft";
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
import { adapterModelMetadataForPromotion } from "./promotionMeta";
import { adapterRevisionDigest } from "./validator";
import { verifyAdapterMode, type AdapterVerificationResult } from "./verifier";
import { redactAdapterSecrets } from "./redaction";

export { adapterModelMetadataForPromotion } from "./promotionMeta";

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

/**
 * 文本模式 create 的占位。文本的验证与生产都走 streamTextTask（AI SDK 那条路），
 * 从不按这份 create 发请求，promote 也不会为文本建 mapping——它只是让草稿结构完整。
 * 写成真实的 OpenAI 兼容路径而不是空对象，是为了让人读到时不误会「这里少填了东西」。
 */
const TEXT_PRODUCTION_PATH_CREATE = { method: "POST", path: "/chat/completions" } as const;

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
      // 自建/局域网端点没有公开文档可读（为什么见 builtinOpenAiCompatibleDraft 头注释）：不猜文档、
      // 不叫 AI，直接用内置 OpenAI 兼容契约进真实验证。必须在下面的分级之前——媒体模型也一样适用。
      const builtinDraft = builtinDraftForUndocumentedEndpoint(connection);
      if (builtinDraft) {
        await this.promoteFinal(id, builtinDraft, await this.verifyDraft(id, connection, builtinDraft, 1, []));
        return;
      }
      // 分级（2026-08-12）：只有「Nomi 不知道接法」的模型才值得查文档 + AI 编译。
      // 文本的接法全行业已统一到 OpenAI /v1/chat/completions（DeepSeek、Kimi、GLM、Qwen、
      // 阶跃、MiniMax、豆包、xAI、Mistral 全是；Anthropic、Gemini 也都开了兼容层），
      // 何况文本验证走 streamTextTask（生产同一条路）、根本不读编译出来的草稿——
      // 编译它纯属白花时间，还平添「文档没抓到 / 编译失败」这些真实使用路径没有的失败模式。
      // 旧行为：全部无差别走完整流程，两个 DeepSeek 文本模型烧掉 132 秒后判死。
      const mediaModels = connection.models.filter((model) => model.kind !== "text");
      const needsCompile = mediaModels.length > 0;
      let docs: DiscoveredDocs = { sources: [], corpus: "" };
      let compilation: ProviderAdapterCompilation = {
        draft: {
          provider: {
            baseUrl: String(connection.vendor.baseUrlHint || ""),
            authType: (connection.vendor.authType || "bearer") as AdapterAuthType,
            ...(connection.vendor.providerKind ? { providerKind: connection.vendor.providerKind } : {}),
          },
          sources: [],
          models: [],
        },
        failures: [],
      };
      const languageModels = needsCompile ? this.dependencies.resolveLanguageModels(connection) : [];
      if (needsCompile) {
        this.setStage(id, "discovering_docs");
        docs = await this.dependencies.discover({
          baseUrl: String(connection.vendor.baseUrlHint || ""),
          modelKeys: mediaModels.map((model) => model.modelKey),
        });
        if (docs.sources.length === 0 || !docs.corpus.trim()) {
          // 文档是增强接法准确率的证据，不是用户模型能否进入目录的准入证。
          // 自定义公网中转也经常没有可抓取的文档站；此时用与局域网相同的通用兼容契约真测，
          // 失败能力仍逐项标记并提供「我自己接」，不能因为 Nomi 没找到文档就把整批模型藏掉。
          compilation = {
            draft: buildOpenAiCompatibleDraft({
              baseUrl: String(connection.vendor.baseUrlHint || ""),
              authType: (connection.vendor.authType || "bearer") as AdapterAuthType,
              ...(connection.vendor.providerKind ? { providerKind: connection.vendor.providerKind } : {}),
              models: mediaModels.map((model) => ({ modelKey: model.modelKey, labelZh: model.labelZh, kind: model.kind })),
            }),
            failures: [],
          };
        } else {
          this.store.updateRun(id, (run) => ({
            ...run,
            sourceUrls: docs.sources.map((source) => source.url),
            updatedAt: this.dependencies.now(),
          }));
          this.setStage(id, "compiling");
          compilation = await this.dependencies.compile({
            languageModels,
            providerBaseUrl: String(connection.vendor.baseUrlHint || ""),
            authType: (connection.vendor.authType || "bearer") as AdapterAuthType,
            selectedModels: mediaModels.map((model) => ({ modelKey: model.modelKey, label: model.labelZh, kind: model.kind })),
            docs: docs.sources,
          });
        }
      }
      // 文本条目不经 AI：接法固定、模式表也固定（chat）。合进草稿只为让验证与展示有位置。
      // 文本条目**以这里为单一真相**——编译器万一也吐了同名文本条目（误分类/被喂了不该喂的），
      // 一律以这份为准替换掉，否则同一个模型会出现两条、验证跑两遍（有回归钉子）。
      const textModels = connection.models.filter((model) => model.kind === "text");
      const textModelKeys = new Set(textModels.map((model) => model.modelKey));
      const withTextModels = (compiled: readonly AdapterModelDraft[]): AdapterModelDraft[] => [
        ...compiled.filter((model) => !textModelKeys.has(model.modelKey)),
        ...textModels.map((model) => ({
          modelKey: model.modelKey,
          labelZh: model.labelZh,
          kind: "text" as const,
          modes: [{ taskKind: "chat" as const, create: TEXT_PRODUCTION_PATH_CREATE, testParams: {}, sourceUrls: [] }],
        })),
      ];
      let candidate: ProviderAdapterDraft = { ...compilation.draft, models: withTextModels(compilation.draft.models) };
      let results = await this.verifyDraft(id, connection, candidate, 1, compilation.failures);
      const maxRepairs = this.dependencies.maxRepairs ?? 2;
      let repairError: string | undefined;
      // 自动修复重新生成的是「HTTP 接法草稿」，而文本模型的验证走 streamTextTask（生产同一条路）、
      // 压根不读这份草稿——对文本失败重修等于原样再发一次同样的请求，必然同样失败。
      // 旧行为：白转 2 轮、界面还写着「正在根据真实错误自动修复…」（假的），用户干等 2 分钟拿同一个结果。
      // 只让「修得动的」失败（真正按草稿发请求的非文本模型）触发重修。(2026-08-12)
      const repairableKeys = new Set(
        docs.sources.length > 0
          ? connection.models.filter((model) => model.kind !== "text").map((model) => model.modelKey)
          : [],
      );
      for (let repairAttempt = 1; repairAttempt <= maxRepairs; repairAttempt += 1) {
        const compiledKeys = new Set(candidate.models.map((model) => model.modelKey));
        const failure = results.find(
          (result) => result.state === "failed" && compiledKeys.has(result.modelKey) && repairableKeys.has(result.modelKey),
        );
        if (!failure) break;
        this.store.updateRun(id, (run) => ({ ...run, stage: "repairing", repairAttempt, updatedAt: this.dependencies.now() }));
        try {
          // 只让重修碰它修得动的那些模型，修完再把文本条目按单一真相合回去——
          // 否则重修会顺手用 AI 重新生成文本条目，把确定性的那份覆盖掉。
          const repaired = await this.dependencies.repair({
            languageModels,
            providerBaseUrl: String(connection.vendor.baseUrlHint || ""),
            selectedModelKeys: candidate.models.filter((model) => repairableKeys.has(model.modelKey)).map((model) => model.modelKey),
            previousDraft: candidate,
            failure: {
              stage: failure.stage || "create",
              message: failure.error || "Unknown verification failure",
              modelKey: failure.modelKey,
              taskKind: failure.taskKind,
            },
            docs: docs.sources,
          });
          candidate = { ...repaired, models: withTextModels(repaired.models) };
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
              // 归类原样透传（抛出点已查表定好），别让渲染层再去猜。
              ...(verified.errorCategory ? { errorCategory: verified.errorCategory } : {}),
              ...(verified.httpStatus ? { httpStatus: verified.httpStatus } : {}),
            };
        results.push(modeResult);
        const persistedModeResult: AdapterModeResult = {
          taskKind: modeResult.taskKind,
          state: modeResult.state,
          attempts: modeResult.attempts,
          ...(modeResult.stage ? { stage: modeResult.stage } : {}),
          ...(modeResult.error ? { error: modeResult.error } : {}),
          ...(modeResult.errorCategory ? { errorCategory: modeResult.errorCategory } : {}),
          ...(modeResult.httpStatus ? { httpStatus: modeResult.httpStatus } : {}),
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
