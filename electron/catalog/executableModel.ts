// 可执行模型解析（vendor 启用 + 模型启用 + key 解密）——从 runtime.ts 下沉（R12 净减，
// 依赖全在 catalog 域）；runtime re-export 保住 textTaskRunner/taskResultQuery 既有 import 面。
import { readCatalog } from "./catalogStore";
import { decryptApiKeyRecord, decryptCustomConfigWithLegacy } from "./secrets";
import { selectExecutableModel, type BillingModelKind } from "./types";
import type { Model, Vendor } from "./types";

export function findExecutableModel(
  vendorKey: string,
  modelKey: string,
  kind?: BillingModelKind,
): { vendor: Vendor; model: Model; apiKey: string; customConfig: Record<string, string> } {
  const state = readCatalog();
  const vendor = state.vendors.find((item) => item.key === vendorKey && item.enabled);
  if (!vendor) throw new Error(`Vendor is not enabled: ${vendorKey}`);
  // 精确 modelKey 优先于 alias（修双键 OR 误路由，selectExecutableModel 纯函数单测覆盖）。
  const model = selectExecutableModel(state.models, vendorKey, modelKey, kind);
  // 分**三**种说法。旧实现只分两种，把「类型登记错了」压进了 `Model is not enabled`——那句话是**假的**
  // （模型明明启用着），渲染层据此说「模型未配置·去模型接入页设置」，而用户去了那页只会看到一切正常，
  // 没有一个字指向真实缺口（接入时 guessModelKind 按关键词猜错了类型）。三分之后各归各的动作：
  //  · 记录整条不在了 = 已退役下线（seedBuiltins 退役清单主动移除）→ model-retired，给「换个模型」；
  //  · 记录在、但被停用                                        → model-config，给「去模型接入」；
  //  · 记录在、也启用着、只是 kind 与本次请求不符               → model-kind-mismatch，给「改成 X」。
  // 第三种带上两个 kind：错误文案要说得出「登记为什么、这里要什么」，渲染层不该去反猜。
  if (!model) {
    const registered = state.models.find(
      (item) => item.vendorKey === vendorKey && (item.modelKey === modelKey || item.modelAlias === modelKey),
    );
    if (!registered) throw new Error(`Model is retired: ${modelKey}`);
    if (registered.enabled && kind && registered.kind !== kind) {
      throw new Error(`Model kind mismatch: ${modelKey} (registered=${registered.kind}, requested=${kind})`);
    }
    throw new Error(`Model is not enabled: ${modelKey}`);
  }
  const apiKey = decryptApiKeyRecord(state.apiKeysByVendor[vendorKey]);
  if (vendor.authType !== "none" && !apiKey) throw new Error(`API key missing: ${vendorKey}`);
  const customConfig = decryptCustomConfigWithLegacy(state.apiKeysByVendor[vendorKey], vendor.meta);
  return { vendor, model, apiKey, customConfig };
}

export function findExecutableModelForTask(
  vendorKey: string,
  modelKey: string,
  kind: BillingModelKind,
): { vendor: Vendor; model: Model; apiKey: string; customConfig: Record<string, string> } {
  if (modelKey) return findExecutableModel(vendorKey, modelKey, kind);
  const state = readCatalog();
  const model = state.models.find((item) => item.vendorKey === vendorKey && item.enabled && item.kind === kind);
  if (!model) throw new Error(`No enabled ${kind} model for vendor: ${vendorKey}`);
  return findExecutableModel(vendorKey, model.modelKey, kind);
}
