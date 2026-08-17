// 交付1 · nomi_list_models 的「真话」派生（纯函数，输入 CatalogState → 输出逐模型清单，可零依赖单测）。
//
// 旧 listAvailableModels 只 filter(enabled) 就说「已接入且可用」——不验 key（kie 没配 key 也列为可用，
// 调用它白白浪费一趟往返报「API key missing: kie」）、不说这个模型带不带得动参考。这里补两件真话：
//   ① keyStatus：ok / missing / locked（复用 secrets.apiKeyDecryptStatus 的三态健康度，P1 不另写解密探测）；
//   ② references：这个模型的 mapping body 到底带得动什么参考（复用 referenceReachability.bodyReferenceSupport，
//      与第三闸/UI 收窄同源判据，P1 不另写一份），跨该模型所有 mapping 汇总，并记下「哪个 taskKind 模式能带」。
// 不静默丢任何模型——发不出/没 key 的照列，带上状态与一句人话，让 agent 能对用户说「kie 没配 key」而非瞎猜。
import { apiKeyDecryptStatus, type ApiKeyDecryptStatus } from "./secrets";
import { bodyReferenceSupport, type BodyReferenceSupport } from "./referenceReachability";
import type { ModelModeBody } from "./taskParams";
import type { CatalogState, Mapping, ProfileKind } from "./types";

/** 一个模型跨其所有 mapping 汇总出的参考承载力 + 是哪些模式（taskKind）带得动。 */
export type ModelReferenceSupport = BodyReferenceSupport & {
  /** 携带参考的 taskKind 模式（如 image_to_video / image_edit）——供拒发建议/选型时点名"用哪个模式"。 */
  referenceModes: ProfileKind[];
};

export type ModelListingEntry = {
  vendor: string;
  vendorName: string;
  modelKey: string;
  kind: string;
  label: string;
  /** 这个模型此刻能不能真用：ok=key 在且解得开；missing=没配 key；locked=key 在但当前宿主身份解不开。 */
  keyStatus: ApiKeyDecryptStatus;
  /** 一句人话状态（诚实敞口，D4）：ok 报可用；missing/locked 各报缺口 + 该干什么。 */
  statusReason: string;
  /** 该模型带得动的参考类别 + 承载模式（无 mapping 或纯文生 → 全 false / 空）。 */
  references: ModelReferenceSupport;
};

/** authType==='none' 的 vendor 不需要 key（如本地 ComfyUI）——恒 ok，不参与 key 探测。 */
function keyStatusForModel(state: CatalogState, vendorKey: string, authType: string | undefined): ApiKeyDecryptStatus {
  if (authType === "none") return "ok";
  return apiKeyDecryptStatus(state.apiKeysByVendor[vendorKey]);
}

/** 一句人话状态（vendor 名插值，不 hardcode 任何 vendor）。 */
function statusReasonFor(keyStatus: ApiKeyDecryptStatus, vendorName: string): string {
  switch (keyStatus) {
    case "ok":
      return "已接入且可用";
    case "locked":
      return `${vendorName} 的 API Key 已保存但当前宿主身份解不开（多见于 MCP/命令行宿主与 Nomi 主程序加密身份不一致）；请在 Nomi 应用里重新保存该 Key，或让宿主以正确身份运行`;
    case "missing":
    default:
      return `未配置 ${vendorName} 的 API Key；请先在 Nomi 应用的模型接入里填入`;
  }
}

/**
 * 这个模型能用到的所有 mapping（精确绑定该 modelKey 的 + generic 无 modelKey 的通用模板）。
 * **单一真相源**：list_models 的参考承载力汇总与 runtime 的拒发建议（modelModeBodies）都用它，不各写一份（P1）。
 */
export function mappingsForModel(mappings: Mapping[], vendorKey: string, modelKey: string, modelAlias: string | null | undefined): Mapping[] {
  return mappings.filter(
    (m) =>
      m.vendorKey === vendorKey &&
      (m.modelKey === undefined || m.modelKey === "" || m.modelKey === modelKey || (modelAlias ? m.modelKey === modelAlias : false)),
  );
}

/** 这个模型**所有启用模式**的 (taskKind, create body)——供 L3 拒发建议判"哪个模式带得动携带的参考"（交付4）。 */
export function modelModeBodies(mappings: Mapping[], vendorKey: string, modelKey: string, modelAlias: string | null | undefined): ModelModeBody[] {
  return mappingsForModel(mappings, vendorKey, modelKey, modelAlias)
    .filter((m) => m.enabled)
    .map((m) => ({ taskKind: m.taskKind, body: m.create?.body }));
}

/** 跨该模型所有 mapping 汇总参考承载力（任一 mapping 能发 = 能发；记下携带参考的 taskKind）。 */
function referenceSupportForModel(modelMappings: Mapping[]): ModelReferenceSupport {
  const out: ModelReferenceSupport = { image: false, video: false, audio: false, multiImage: false, referenceModes: [] };
  const modes = new Set<ProfileKind>();
  for (const mapping of modelMappings) {
    const support = bodyReferenceSupport(mapping.create?.body);
    out.image ||= support.image;
    out.video ||= support.video;
    out.audio ||= support.audio;
    out.multiImage ||= support.multiImage;
    if (support.image || support.video || support.audio) modes.add(mapping.taskKind);
  }
  // 稳定排序（输出确定性，便于快照/断言）。
  out.referenceModes = [...modes].sort();
  return out;
}

/**
 * 逐模型清单（只列 enabled 模型，与旧行为一致；但每条都带 keyStatus + references 真话）。
 * 纯函数：输入完整 CatalogState，不读盘不解密以外的副作用（解密由 secrets 注入的 safeStorage 完成）。
 */
export function deriveModelListing(state: CatalogState): ModelListingEntry[] {
  const vendorByKey = new Map(state.vendors.map((v) => [v.key, v] as const));
  return state.models
    .filter((model) => model.enabled)
    .map((model) => {
      const vendor = vendorByKey.get(model.vendorKey);
      const vendorName = vendor?.name || model.vendorKey;
      const keyStatus = keyStatusForModel(state, model.vendorKey, vendor?.authType);
      const modelMappings = mappingsForModel(state.mappings, model.vendorKey, model.modelKey, model.modelAlias);
      return {
        vendor: model.vendorKey,
        vendorName,
        modelKey: model.modelKey,
        kind: model.kind,
        label: model.labelZh || model.modelKey,
        keyStatus,
        statusReason: statusReasonFor(keyStatus, vendorName),
        references: referenceSupportForModel(modelMappings),
      };
    });
}
