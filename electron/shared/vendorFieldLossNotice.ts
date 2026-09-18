/**
 * 「这条连接的声明可能在旧版本里被抹掉了」这条提示的**共享契约**：一个 meta 键名 + 两个纯读写它的函数。
 *
 * 为什么住在 `electron/shared/`：主进程的一次性迁移（`electron/catalog/vendorFieldLossRepair.ts`）
 * 盖这个标记，渲染层的连接卡（`src/ui/onboarding/`）读它、并在用户点确认时清掉它。两端必须
 * 对同一个键名达成一致，而渲染层不许 import 主进程实现（`check:boundaries` 的 src-no-import-electron）
 * ——于是键名与读写它的纯函数放在这个中立层，两边各自引用同一份，不各抄一个字符串。
 */
import { isJsonRecord } from "../jsonUtils";

/** 标记键。值是迁移盖章的 ISO 时间戳。 */
export const VENDOR_FIELD_LOSS_NOTICE_META_KEY = "vendorFieldLossNotice";

/** 清掉标记（用户确认后走 upsertVendor 写回）。meta 只剩空壳时整个去掉，不留空对象。 */
export function withoutVendorFieldLossNotice(meta: unknown): unknown {
  if (!isJsonRecord(meta) || !Object.prototype.hasOwnProperty.call(meta, VENDOR_FIELD_LOSS_NOTICE_META_KEY)) return meta;
  const clean = { ...meta };
  delete clean[VENDOR_FIELD_LOSS_NOTICE_META_KEY];
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** 这条记录上还挂着「声明可能被抹掉了」的提示吗——挂着就返回盖章时间，否则 null。 */
export function vendorFieldLossNoticeAt(vendor: { meta?: unknown } | null | undefined): string | null {
  const meta = vendor?.meta;
  if (!isJsonRecord(meta)) return null;
  const at = meta[VENDOR_FIELD_LOSS_NOTICE_META_KEY];
  return typeof at === "string" && at.trim() ? at : null;
}
