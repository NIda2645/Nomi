/**
 * 对等测试矩阵的夹具（零额度）。**不 import vitest**：`electron/tsconfig.json` 把
 * 除 `*.test.ts` 之外的 `electron/**` 全部编进主进程构建，测试运行器不能进产物。
 * 同 `agentPanelSpendConfirmTestUtils.ts` 的既有约定。
 *
 * 两台发动机都读**同一份真实内置目录**（`ensureBuiltinModelSeeds()` 种下来的 20 家 /
 * 156 个模型 / 248 条 mapping），供应商换成本机捕获器：
 *   · 引擎 A ＝ `electron/runtime.ts:309 runTask`（画布手动生成、分镜行、试跑、legacy MCP 单发）
 *   · 引擎 B ＝ `createGenerationProviderBootstrap()` 造出来的生成 provider
 *              （Agent 付款卡、提交执行计划、`nomi_start_generation`、全自动 / 批量 Run）
 * 出站在 `globalThis.fetch` 这一层捕获——两台都经过它，所以捕获点对两边是同一个。
 */
import { readCatalog } from "../catalog/catalogStore";
import type { CatalogState } from "../catalog/types";
import { redactAuthorization, type OutboundRecord } from "./outboundRecord";

export type CapturedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type FetchCapture = {
  calls: CapturedCall[];
  /** 下一次（及之后）出站的应答；默认是一次异步受理（`task_id` + `completed`）。 */
  respondWith(factory: (call: CapturedCall) => { status: number; payload: unknown }): void;
  reset(): void;
  restore(): void;
};

const DEFAULT_RESPONSE = () => ({
  status: 200,
  payload: { code: 200, data: [{ task_id: "parity-task-1", status: "completed" }] },
});

/** 在 `globalThis.fetch` 上装一个记录器。所有出站（两台发动机、四条鉴权路）都从这里过。 */
export function installFetchCapture(): FetchCapture {
  const original = globalThis.fetch;
  const calls: CapturedCall[] = [];
  let responder = DEFAULT_RESPONSE as (call: CapturedCall) => { status: number; payload: unknown };
  const impl = async (input: unknown, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
    let body: unknown = null;
    const raw = init.body;
    if (typeof raw === "string") {
      try { body = JSON.parse(raw); } catch { body = raw; }
    } else if (raw) {
      body = `[${raw.constructor?.name ?? "stream"}]`;
    }
    const headers: Record<string, string> = {};
    const source = init.headers as Record<string, string> | undefined;
    if (source) for (const [key, value] of Object.entries(source)) headers[key.toLowerCase()] = String(value);
    const call: CapturedCall = { url, method: String(init.method || "GET"), headers, body };
    calls.push(call);
    const { status, payload } = responder(call);
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  };
  (globalThis as { fetch: unknown }).fetch = impl;
  return {
    calls,
    respondWith(factory) { responder = factory; },
    reset() { calls.length = 0; responder = DEFAULT_RESPONSE; },
    restore() { (globalThis as { fetch: unknown }).fetch = original; },
  };
}

/** 真实内置目录 + 给点名的几家填上密钥（safeStorage 必须在测试里可用）。 */
export async function seedParityCatalog(vendorKeys: readonly string[] = ["apimart", "higgsfield"]): Promise<CatalogState> {
  const store = await import("../catalog/catalogStore");
  store.ensureBuiltinModelSeeds();
  for (const key of vendorKeys) store.upsertModelCatalogVendorApiKey(key, { apiKey: `sk-parity-${key}` });
  return store.readCatalog();
}

function recordFromCall(call: CapturedCall | undefined, notes?: Record<string, unknown>): OutboundRecord {
  if (!call) return { failure: { code: "no_outbound_request", message: "没有任何出站请求" }, ...(notes ? { notes } : {}) };
  const url = new URL(call.url);
  return {
    request: {
      method: call.method.toUpperCase(),
      origin: url.origin,
      path: url.pathname,
      authorization: redactAuthorization(call.headers),
      contentType: call.headers["content-type"] ?? "(none)",
      body: call.body,
    },
    ...(notes ? { notes } : {}),
  };
}

function failureCode(error: unknown): string {
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  if (typeof candidate?.code === "string" && candidate.code.trim()) return candidate.code;
  const message = String(candidate?.message ?? error);
  // 供应商就绪那一步的机读身份（`mcpGenerationTools.ts:638` 的 `configured_provider`）。
  if (/configured_provider/.test(message)) return "configured_provider";
  if (/参数 .* 不符合当前模型的声明|contract_invalid/.test(message)) return "contract_invalid";
  return typeof candidate?.name === "string" && candidate.name ? candidate.name : "error";
}

export type EngineATaskInput = {
  vendorKey: string;
  kind: string;
  prompt: string;
  extras: Record<string, unknown>;
};

/** 引擎 A：`runtime.runTask`（付费令牌用真的 `mintSpendGrant` 铸，和画布确认卡同一把）。 */
export async function driveEngineA(capture: FetchCapture, input: EngineATaskInput): Promise<OutboundRecord> {
  capture.reset();
  const { mintSpendGrant } = await import("../spendGrant");
  const nodeId = String(input.extras.nodeId ?? "parity-node");
  const grantId = mintSpendGrant({ nodeIds: [nodeId] });
  const { runTask } = await import("../runtime");
  try {
    await runTask({
      vendor: input.vendorKey,
      request: { kind: input.kind, prompt: input.prompt, extras: { ...input.extras, grantId } },
    });
  } catch (error) {
    if (!capture.calls.length) return { failure: { code: failureCode(error), message: String((error as Error)?.message ?? error) } };
  }
  return recordFromCall(capture.calls[0]);
}

export type EngineBTaskInput = {
  vendorKey: string;
  modelId: string;
  /** 目录任务种类（`text_to_image` / `image_edit` / `image_to_video` …）。 */
  mode: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references?: Array<{ assetId: string; contentHash: string; version: number; kind?: "image" | "video" | "audio"; role?: "character" | "first_frame" | "last_frame" | "reference" | "audio" }>;
  /**
   * 已本地化成「供应商够得到的 URL」的参考素材表（key 由 `spendReferenceKey` 派生）。
   * 真实宿主在授权信封那一步就把它准备好了（`prepareProductionGenerationAuthorization.ts:237`），
   * 不给它 = 测一个宿主没接线的假世界，会把「参考图这条路今天走不通」误报成产品分裂。
   */
  referenceUrls?: Readonly<Record<string, string>>;
};

/**
 * 引擎 B：先问 `createGenerationProviderBootstrap` 要 provider（这一步就是 A3/BL-1 的现场：
 * 非 APIMart 一律拿不到），再走 `compileExecutionContract` → `provider.buildRequest` → `submit`。
 */
export async function driveEngineB(capture: FetchCapture, input: EngineBTaskInput): Promise<OutboundRecord> {
  capture.reset();
  const store = await import("../catalog/catalogStore");
  const state = store.readCatalog();
  const { createGenerationProviderBootstrap } = await import("../capabilityCore/generationProviderBootstrap");
  const bootstrap = createGenerationProviderBootstrap(state, { catalogReader: () => store.readCatalog() });
  const provider = bootstrap.providers.find((candidate) => candidate.providerId === input.vendorKey);
  if (!provider) {
    const readiness = bootstrap.readinessByProvider[input.vendorKey];
    return {
      failure: {
        code: readiness?.missingForSubmit?.[0] ?? "configured_provider",
        message: `宿主没有为 ${input.vendorKey} 装配生成供应商`,
      },
      notes: { providersBuilt: bootstrap.providers.map((candidate) => candidate.providerId) },
    };
  }
  const { createCatalogModuleRegistry } = await import("../capabilityCore/moduleCatalogBootstrap");
  const { compileExecutionContract } = await import("../capabilityCore/executionContract");
  const registry = createCatalogModuleRegistry(state, { readinessByProvider: bootstrap.readinessByProvider });
  let contract;
  try {
    contract = compileExecutionContract({
      candidateId: "parity-candidate",
      revision: 1,
      moduleId: "generation.single-shot",
      providerId: input.vendorKey,
      modelId: input.modelId,
      mode: input.mode,
      prompt: input.prompt,
      parameters: input.parameters,
      references: input.references ?? [],
    }, registry);
  } catch (error) {
    return { failure: { code: failureCode(error), message: String((error as Error)?.message ?? error) } };
  }
  const notes = {
    droppedFields: contract.droppedFields.map((entry) => entry.path),
    contractParameters: contract.parameters,
  };
  try {
    const request = provider.buildRequest({
      moduleId: contract.moduleId,
      providerId: contract.providerId,
      modelId: contract.modelId,
      mode: contract.mode,
      prompt: contract.prompt,
      parameters: contract.parameters,
      references: contract.references,
      contractHash: contract.contractHash,
      idempotencyKey: "parity-idempotency-key",
      requestFingerprint: "f".repeat(64),
      ...(input.referenceUrls ? { referenceUrls: input.referenceUrls } : {}),
      ...(contract.transportModelId ? { transportModelId: contract.transportModelId } : {}),
    });
    await provider.submit(request, "parity-idempotency-key");
  } catch (error) {
    if (!capture.calls.length) return { failure: { code: failureCode(error), message: String((error as Error)?.message ?? error) }, notes };
  }
  return recordFromCall(capture.calls[0], notes);
}
