/**
 * 一次性修复：把上一版 upsert 抹掉的供应商声明补回来（P2 的「旧数据还能不能把这类问题带回来」那一问）。
 *
 * `upsertDraft.ts` 止住的是**未来**的丢失。已经被抹掉的记录不会自己回来——装上新版的用户，
 * Higgsfield 仍然 401、参考图仍然不生效。本模块回答「这些记录还救不救得回来」。
 *
 * ## 可恢复性盘点（先数出处，再谈补法）
 * `Vendor.assetIngestion` 与 `Vendor.authScheme` 在全仓**只有两个产地**：
 *   1. `seedBuiltins.seedVendor` ← `BUILTIN_VENDOR_SEEDS`（代码里，永远在）；
 *   2. `importModelCatalogPackage` ← 用户手上那份接入包（`catalogPackageFormat` 的 vendor schema
 *      是 `.passthrough()`，原样透传）。
 * 设置页、接入向导、MCP 的 `manage_model_catalog_connection.update_vendor`（白名单 6 个字段）
 * **都写不了这两项**——这不是猜测，是 grep 全仓的结论。于是：
 *   · 内置家 ⇒ 出处在代码里 ⇒ **能补**，就是本模块做的事；
 *   · 接入包导入的自建家 ⇒ 出处只在用户那份包里 ⇒ **补不了**，只能明着告诉他重新导入（见 stamp）；
 *   · 手动接入/向导建的自建家 ⇒ 本来就没有这两项 ⇒ **不受影响**（同一条 grep 结论的反面）。
 * `Mapping.delivery` / `Mapping.abandon` 同理：唯一产地是接入包，没有代码侧出处，补不了。
 *
 * ## 为什么做成带版本号的一次性迁移，而不是加载时补齐
 * 加载时补齐会**永远**跑下去：写路径已经被类型闭合、这类丢失不可能再发生，那它守的就是一件
 * 不会再来的事；代价却是它每次都会跟用户较劲——用户哪天真想把某家的 `assetIngestion` 去掉，
 * 下次启动又被它按种子塞回来，而这一次我们连「是我们抹的还是他删的」都分不出来。
 * 一次性迁移只在 v12→v13 那一刻跑一次，可审计、可复现、之后永不再碰用户的值。
 *
 * ## 只补「字段缺失」，不补「值不同」
 * 判据是 `!(field in vendor)` —— 键**不存在**才补。用户把 Higgsfield 的方案词改成别的、
 * 或显式清成 `null`，键都是在的，本迁移一律不碰（覆盖用户显式改过的值是第二次数据丢失）。
 */
import { builtinVendorSeed } from "./builtinVendorSeeds";
import { logWarn } from "../logging/logger";
import { nowIso } from "../jsonUtils";
import type { CatalogState, Vendor } from "./types";
import { isJsonRecord } from "../jsonUtils";

/**
 * 给自建连接盖的一次性标记：「这条记录活过了那个会抹字段的版本，而它的出处不在代码里，
 * 我补不了」。存在 `vendor.meta` 而不是新开一个 CatalogState 字段——meta 已经随
 * `ModelCatalogVendorDto` 到渲染层，界面读得到、用户点「知道了」时用现成的 upsertVendor 清掉，
 * 不必为一次性提示新造一条 IPC 与一份状态（P1：不长第二套通知系统）。
 */
export const VENDOR_FIELD_LOSS_NOTICE_META_KEY = "vendorFieldLossNotice";

/**
 * 只有**在修复之前写过**的记录才可能被抹掉。这条界线让提示落在真正有风险的那批记录上：
 * `updatedAt` 晚于它 = 这条记录是修好之后写的，写路径已被类型闭合，不可能丢过字段，
 * 于是不打扰（给没风险的记录盖提示，是把诚实变成噪音）。
 */
export const VENDOR_FIELD_LOSS_CUTOFF_ISO = "2026-09-18T00:00:00.000Z";

/** 本次修复涉及的字段——`Vendor` 上那两项「只有种子和接入包写得了」的声明。 */
const SEED_RESTORABLE_FIELDS = ["authScheme", "assetIngestion"] as const satisfies ReadonlyArray<keyof Vendor>;

export type VendorFieldLossRepairReport = {
  /** 按种子补回的内置家：{ vendorKey, fields }。 */
  repaired: Array<{ vendorKey: string; fields: string[] }>;
  /** 补不了、只能告诉用户的自建家 key。 */
  stamped: string[];
};

function withNotice(meta: unknown, stampedAt: string): unknown {
  const base = isJsonRecord(meta) ? { ...meta } : {};
  base[VENDOR_FIELD_LOSS_NOTICE_META_KEY] = stampedAt;
  return base;
}

/** 清掉标记（用户点「知道了」时走 upsertVendor 写回）。meta 只剩空壳时整个去掉，不留空对象。 */
export function withoutVendorFieldLossNotice(meta: unknown): unknown {
  if (!isJsonRecord(meta) || !Object.prototype.hasOwnProperty.call(meta, VENDOR_FIELD_LOSS_NOTICE_META_KEY)) return meta;
  const clean = { ...meta };
  delete clean[VENDOR_FIELD_LOSS_NOTICE_META_KEY];
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** 这条记录上还挂着「声明可能被抹掉了」的提示吗。 */
export function vendorFieldLossNoticeAt(vendor: { meta?: unknown } | null | undefined): string | null {
  const meta = vendor?.meta;
  if (!isJsonRecord(meta)) return null;
  const at = meta[VENDOR_FIELD_LOSS_NOTICE_META_KEY];
  return typeof at === "string" && at.trim() ? at : null;
}

/**
 * v12 → v13 的一次性修复。纯函数：只改内存 state，落盘由 migrateCatalogForward 统一做。
 * `stampedAt` 由调用方传入（迁移时刻），便于测试固定时间。
 */
export function repairDroppedVendorSeedFields(state: CatalogState, stampedAt: string): {
  state: CatalogState;
  report: VendorFieldLossRepairReport;
} {
  const repaired: VendorFieldLossRepairReport["repaired"] = [];
  const stamped: string[] = [];
  const vendors = state.vendors.map((vendor) => {
    const seed = builtinVendorSeed(vendor.key);
    if (!seed) {
      // 自建连接：没有代码侧出处，补不了 —— 盖一条可见的提示，绝不静默。
      // 但只盖在修复之前写过的记录上：之后写的那些走的已经是类型闭合的写路径，没风险，别打扰。
      if (String(vendor.updatedAt || "") >= VENDOR_FIELD_LOSS_CUTOFF_ISO) return vendor;
      // 已经盖过就不再刷新时间戳 —— 万一这段被重跑，不许二次改写用户记录（幂等）。
      if (vendorFieldLossNoticeAt(vendor)) return vendor;
      stamped.push(vendor.key);
      return { ...vendor, meta: withNotice(vendor.meta, stampedAt) };
    }
    const restored: Partial<Vendor> = {};
    const fields: string[] = [];
    for (const field of SEED_RESTORABLE_FIELDS) {
      // 键存在 = 用户那边有一个值（哪怕是 null），一律不碰；只补被整个抹掉的键。
      if (Object.prototype.hasOwnProperty.call(vendor, field)) continue;
      const seedValue = seed[field];
      if (seedValue === undefined) continue;
      Object.assign(restored, { [field]: seedValue });
      fields.push(field);
    }
    if (fields.length === 0) return vendor;
    repaired.push({ vendorKey: vendor.key, fields });
    return { ...vendor, ...restored };
  });
  return { state: { ...state, vendors }, report: { repaired, stamped } };
}

/**
 * v12 → v13 迁移体（落盘由 `migrateCatalogForward` 统一做，这里只出新 state）。
 * 单独一个函数是为了让版本表那一段保持「一个版本一两行」的可读形状。
 */
export function migrateVendorFieldLossV13(state: CatalogState): CatalogState {
  const { state: repaired, report } = repairDroppedVendorSeedFields(state, nowIso());
  if (report.repaired.length > 0 || report.stamped.length > 0) {
    logWarn("catalog", "v13-vendor-field-loss-repair", {
      repaired: report.repaired.map((row) => `${row.vendorKey}:${row.fields.join("+")}`).join(","),
      stamped: report.stamped.length,
    });
  }
  return { ...repaired, version: 13 };
}
