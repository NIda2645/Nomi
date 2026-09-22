import crypto from "node:crypto";
import { nowIso } from "../jsonUtils";
import { NEWAPI_STATUS_MAPPING, NEWAPI_VIDEO_CREATE_OP, NEWAPI_VIDEO_QUERY_OP } from "./newapiTransport";
import { isBuiltinRelayVendorKey } from "./relayImageEditMigration";
import type { CatalogState } from "./types";

/**
 * v7 → v8：给**存量**用户自建中转的 video 条目补「图生视频」通道（image_to_video mapping）。
 *
 * 根因：中转接入的视频模型此前只注册 text_to_video 一条 mapping（newapiTransportFor("video") 从来
 * 没给过 image_to_video）。runtime 按 taskKind 选投递通道 → 视频节点一连参考图/首帧就落进
 * imageEditGuardError 的「模型…在本机没有配置『图生视频』通道」，而那条提示让用户「删除后重新
 * 接入一次」——重接一万次也没用，因为接入路径压根不建这条通道。迁移根治，存量不必删了重加。
 *
 * 边界（与 v4/v5 同款嗅探）：只碰非内置 vendor（BUILTIN_VENDOR_KEYS 之外，内置由 seedBuiltins 管）
 * 且确有 `/video/generations` 形状 text_to_video op 的中转。只增不删、已存在就跳过 → 幂等。
 * wire 与文生视频同一条（new-api 的 /v1/video/generations 本就带可选 image 首帧），共用轮询 query。
 */
export function migrateRelayVideoImageToVideo(state: CatalogState): { state: CatalogState; changed: boolean } {
  let changed = false;
  const mappings = [...state.mappings];
  const t = nowIso();
  for (const model of state.models) {
    if (model.kind !== "video" || isBuiltinRelayVendorKey(model.vendorKey)) continue;
    // OpenAI/new-api 兼容视频形状的证据：该 vendor 有一条走 /video/generations 的 text_to_video。
    const t2v = mappings.find(
      (m) =>
        m.vendorKey === model.vendorKey &&
        m.taskKind === "text_to_video" &&
        typeof m.create?.path === "string" &&
        /\/video\/generations$/.test(m.create.path),
    );
    if (!t2v) continue;
    // 已有通道就跳过：本模型精确项，或该 vendor 的通用项（无 modelKey = 覆盖全 vendor）。
    const alreadyRouted = mappings.some(
      (m) => m.vendorKey === model.vendorKey && m.taskKind === "image_to_video" && (!m.modelKey || m.modelKey === model.modelKey),
    );
    if (alreadyRouted) continue;
    mappings.push({
      id: `mapping-${crypto.randomUUID()}`,
      vendorKey: model.vendorKey,
      taskKind: "image_to_video",
      modelKey: model.modelKey,
      name: `${model.labelZh || model.modelKey} · 图生视频`,
      enabled: true,
      // 用 canonical op（保证带 image 首帧位）而不是复制存量 create——老 create 可能是在 image 位
      // 加进模板之前落的盘，照抄等于把缺口一起搬过来。
      create: NEWAPI_VIDEO_CREATE_OP,
      query: t2v.query ?? NEWAPI_VIDEO_QUERY_OP,
      statusMapping: t2v.statusMapping ?? NEWAPI_STATUS_MAPPING,
      createdAt: t,
      updatedAt: t,
    });
    changed = true;
  }
  return { state: changed ? { ...state, mappings } : state, changed };
}
