import crypto from "node:crypto";
import { isJsonRecord, nowIso, type JsonRecord } from "../jsonUtils";
import { NEWAPI_IMAGE_EDIT_OP, NEWAPI_IMAGE_PARAM_MAP, NEWAPI_STANDARD_IMAGE_PARAMS, NEWAPI_VIDEO_PARAM_MAP } from "./newapiTransport";
import { isBuiltinRelayVendorKey } from "./relayImageEditMigration";
import type { CatalogState, Mapping } from "./types";

// 自建中转(relay)的存量目录迁移 v3→v4 / v4→v5。从 catalogStore 拆出（R9 防巨壳：迁移逻辑与
// 读写盘/事务无关，且 v6/v7/v8 的迁移早已各自住独立模块，这里补齐同一分层）。
// 内置 vendor（由 seedBuiltins 管理、op 已正确）不碰——尤其别碰 apimart：它的 size 是比例字符串
// ("16:9")不是像素，套 OpenAI 像素转换会发错。

/**
 * v3 → v4：给**用户自建 OpenAI 兼容中转**的旧图像/视频 create op 补 paramMap（铁律翻译层）。
 * 这些 op 是档案中性化之前持久化的（读 {{request.params.size}} 像素，但无 paramMap）——档案现在产
 * 中性「比例 + 清晰度档位」，没翻译就发不出去（gpt-image-2 × 自建中转报错的根因）。幂等：已有 paramMap
 * 或非 relay 形状的跳过。按 op.path 识别 new-api/OpenAI 兼容形状（/images|video/generations）。
 */
export function migrateRelayParamMaps(mappings: Mapping[]): { mappings: Mapping[]; changed: boolean } {
  let changed = false;
  const out = mappings.map((m) => {
    if (isBuiltinRelayVendorKey(m.vendorKey)) return m;
    const create = m.create;
    if (!create || create.paramMap) return m;
    const pathStr = typeof create.path === "string" ? create.path : "";
    const isImage = /\/images\/generations$/.test(pathStr);
    const isVideo = /\/video\/generations$/.test(pathStr);
    if (!isImage && !isVideo) return m;
    // 只在 body 确实读 size（即 OpenAI 兼容像素契约）时补——避免给不相干形状乱套。
    if (!JSON.stringify(create.body ?? "").includes("request.params.size")) return m;
    changed = true;
    return { ...m, create: { ...create, paramMap: isImage ? NEWAPI_IMAGE_PARAM_MAP : NEWAPI_VIDEO_PARAM_MAP } };
  });
  return { mappings: out, changed };
}

/** 老「标准图片参数」签名（size/quality/n 的子集且非空）——v5 迁移只把这种明确的旧手动接入形状
 *  升级成现行 比例+清晰度(1K/2K/4K) 标准；doc 派生的自定义参数（键不在此集合）一律不碰。 */
function isLegacyStandardImageParams(parameters: unknown): boolean {
  if (!Array.isArray(parameters) || parameters.length === 0) return false;
  const LEGACY_KEYS = new Set(["size", "quality", "n"]);
  return parameters.every((p) => isJsonRecord(p) && LEGACY_KEYS.has(String(p.key)));
}

/** NEWAPI 标准图片参数 → model.meta.parameters 投影（与 commitOnboardedModelToCatalog 的
 *  paramsToOnboardingFields→metaParameters 同形状：{key,label,type,options?,default?}）。 */
function standardImageMetaParameters(): JsonRecord[] {
  return NEWAPI_STANDARD_IMAGE_PARAMS.map((p) => ({
    key: p.key,
    label: p.label,
    type: p.type,
    ...(p.options.length ? { options: p.options } : {}),
    ...(typeof p.defaultValue !== "undefined" ? { default: String(p.defaultValue) } : {}),
  }));
}

/**
 * v4 → v5：给**存量**用户自建中转的 image 条目补图生图能力。8c711f0c 起新接入才写
 * image_edit mapping + meta.imageOptions.supportsReferenceImages——老条目 UI 不出参考槽、连线参考
 * 会因无 mapping 掉进 fallback 被静默丢（「图生图不按原图」根因之一）。此前唯一解法是让用户
 * 删了重加，迁移根治（docs/plan/2026-07-06-i2i-reference-reliability.md L1）。
 * 边界：只碰非内置 vendor（BUILTIN_VENDOR_KEYS 之外）且有 /images/generations 形状 t2i op 的
 * （OpenAI 兼容证据，与 v4 同款嗅探）；只增不删，自定义参数不动。幂等。
 */
export function migrateRelayImageEditCapability(state: CatalogState): { state: CatalogState; changed: boolean } {
  let changed = false;
  const models = [...state.models];
  const mappings = [...state.mappings];
  const t = nowIso();
  const imageVendorKeys = new Set(models.filter((m) => m.kind === "image").map((m) => m.vendorKey));
  for (const vendorKey of imageVendorKeys) {
    if (isBuiltinRelayVendorKey(vendorKey)) continue;
    const hasOpenAiImageShape = mappings.some(
      (m) =>
        m.vendorKey === vendorKey &&
        m.taskKind === "text_to_image" &&
        typeof m.create?.path === "string" &&
        /\/images\/generations$/.test(m.create.path),
    );
    if (!hasOpenAiImageShape) continue;
    // 1) image_edit mapping（chat/completions 多模态）：per (vendor, image_edit) 一条覆盖该 vendor
    //    全部图像模型（op 用 {{model.modelKey}} 运行时填），与新接入 catalogCommit 同源常量。
    if (!mappings.some((m) => m.vendorKey === vendorKey && m.taskKind === "image_edit")) {
      const vendorName = state.vendors.find((v) => v.key === vendorKey)?.name || vendorKey;
      mappings.push({
        id: `mapping-${crypto.randomUUID()}`,
        vendorKey,
        taskKind: "image_edit",
        name: `${vendorName} · 改图`,
        enabled: true,
        create: NEWAPI_IMAGE_EDIT_OP,
        createdAt: t,
        updatedAt: t,
      });
      changed = true;
    }
    // 2) 每个 image 模型补 supportsReferenceImages（UI 参考槽开关）；3) 老标准参数升级成 比例/清晰度
    //    （v4 已给旧 body 补 paramMap，新参数经 ratioResToOpenAiSize 翻译后照发；治「只能出 1K」）。
    for (let i = 0; i < models.length; i += 1) {
      const m = models[i];
      if (m.vendorKey !== vendorKey || m.kind !== "image") continue;
      const meta = isJsonRecord(m.meta) ? m.meta : {};
      const imageOptions = isJsonRecord(meta.imageOptions) ? meta.imageOptions : {};
      const needsFlag = imageOptions.supportsReferenceImages !== true;
      const needsParams = isLegacyStandardImageParams(meta.parameters);
      if (!needsFlag && !needsParams) continue;
      models[i] = {
        ...m,
        meta: {
          ...meta,
          ...(needsParams ? { parameters: standardImageMetaParameters() } : {}),
          imageOptions: { ...imageOptions, supportsReferenceImages: true },
        },
        updatedAt: t,
      };
      changed = true;
    }
  }
  return { state: changed ? { ...state, models, mappings } : state, changed };
}
