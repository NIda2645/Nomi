/**
 * 参考素材走哪条线缆通道 —— **由档案模式决定，不由 mapping body 猜**（唯一 owner）。
 *
 * ── 为什么必须是模式说了算 ──────────────────────────────────────────────────────
 * 同一条 create mapping 常常同时声明两条**互斥**的参考通道。Seedance 2.5 的 i2v body 里
 * `image_urls`（全能参考）与 `image_with_roles`（首帧 / 首尾帧）并排站着，官方按哪一族
 * 收素材，取决于用户选的是「首帧」还是「全能参考」——**body 本身答不出这个问题**。
 * 档案模式的 `combineSlotsInto` 就是这个答案的声明处（`seedance25Apimart.ts:66/82`）。
 *
 * 渲染层一直是这么做的（`archetypeMeta.ts buildArchetypeInputParams` 的合并槽那一段读
 * `mode.combineSlotsInto`）；Run 路径此前只看「body 里有没有 image_with_roles」
 * （`apimartGenerationProjection.ts` 旧的 `channels.has("image_with_roles")`），于是
 * 同一张参考图、同一个模型、同一次提交，两条路把它放进了**不同的 wire 键**
 * （对等矩阵 NEW-1 ×10）。这里把那句判断收成一个纯函数，两路同吃。
 *
 * ── 没有 modeId 时为什么答「不合并」而不是猜一个 ──────────────────────────────
 * headless 路（`catalog/taskParams.ts` 的 `projectReferencesOntoBodyKeys`）明确**跳过
 * 对象形态键**：`image_with_roles` 这种 `[{url, role}]` 只有拿得到模式的那一层才构造得对。
 * 所以「没有模式」的正确答案就是扁平族键（`image_urls` / `video_urls` / `audio_urls`），
 * 与手动路逐字节相同；猜一个模式正是 NEW-1 那条 bug 的形状。
 */
import { bodyReferencedParamKeys } from "../../catalog/paramTranslate";
import { parseCustomCapabilityContract } from "../customCapabilityContract";
import type { ArchetypeMode, ModelArchetype } from "./types";
import { sourceBackedVideoProfiles } from "./registry";

/** 合并槽：本模式的全部参考槽序列化进**同一个** body 键。`flat` = 纯 URL 数组，否则 `[{url, role}]`。 */
export type ReferenceCombineChannel = { key: string; flat: boolean } | null;

/** 模式声明的合并槽（唯一读点；别在别处展开 `mode.combineSlotsInto`）。 */
export function combineChannelForMode(
  mode: Pick<ArchetypeMode, "combineSlotsInto"> | null | undefined,
): ReferenceCombineChannel {
  const declared = mode?.combineSlotsInto;
  const key = typeof declared?.key === "string" ? declared.key.trim() : "";
  if (!key) return null;
  return { key, flat: declared?.flat === true };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 模型 meta 上显式登记的档案 id（与 `capabilityModeManifest.explicitArchetypeId` 同口径）。 */
function explicitArchetypeId(meta: unknown): string {
  const metadata = record(meta);
  if (!metadata) return "";
  return trim(metadata.archetypeId) || trim(record(metadata.archetype)?.id);
}

function builtInArchetypeById(archetypeId: string): ModelArchetype | null {
  if (!archetypeId) return null;
  return sourceBackedVideoProfiles().find((profile) => profile.id === archetypeId
    || profile.legacyIds?.includes(archetypeId)) ?? null;
}

/** 这个模型的这一档模式（用户自写契约优先，其次内置档案）；找不到 → null。 */
export function archetypeModeForModel(input: {
  meta: unknown;
  kind?: string;
  modeId?: string;
}): ArchetypeMode | null {
  const modeId = trim(input.modeId);
  if (!modeId) return null;
  const contract = parseCustomCapabilityContract(input.meta);
  if (contract && (!input.kind || contract.kind === trim(input.kind))) {
    return contract.modes.find((mode) => mode.id === modeId) ?? null;
  }
  const archetype = builtInArchetypeById(explicitArchetypeId(input.meta));
  return archetype?.modes.find((mode) => mode.id === modeId) ?? null;
}

/**
 * 这次提交的参考素材走哪条通道。`createBody` 是这条 mapping 真正会渲染的 body：
 * 模式声明了合并槽、但这条渠道的 body 根本不引用那个键时，合并槽发不出去 → 退回扁平族键。
 */
export function referenceCombineChannelFor(input: {
  meta: unknown;
  kind?: string;
  modeId?: string;
  createBody: unknown;
}): ReferenceCombineChannel {
  const channel = combineChannelForMode(archetypeModeForModel(input));
  if (!channel) return null;
  return bodyReferencedParamKeys(input.createBody).includes(channel.key) ? channel : null;
}
