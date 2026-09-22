/**
 * 兄弟连接（同域名、不同连接名）的血统登记（issue #831）。
 *
 * 为什么**复用** `vendorLineage` 的既有字段、不另造一套：
 *   · `resolvedVendorLineageRoot` 已经是「从任意 vendor key 解析回它的根」的唯一 owner，
 *     `stagedVendorIdentity` / `catalogCommit` / 渲染层都已走它。再造一套 = 两份真相。
 *   · 兄弟连接只写 `adapterCandidateRootVendorKey`，**刻意不写** `adapterCandidateSourceVendorKey`：
 *     `isCandidateVendor()` 判的正是 source 有没有值。写了 source，这条兄弟连接就会被
 *     `planStagedVendorIdentity` 当成「待淘汰的认证候选」扫进 supersededVendorKeys 删掉
 *     —— 那正是 #831 红测试 (b) 的那条断言。
 *
 * 于是同一份 lineage 里天然分开两种语义：
 *   有 source = 替换候选（新版本要顶掉旧版本）｜只有 root = 兄弟连接（共存，互不为前任）。
 */
import { ADAPTER_CANDIDATE_ROOT_VENDOR_KEY } from "../shared/vendorLineage";
import { builtinVendorKeyOfKey } from "../shared/builtinVendorIdentity";

/**
 * 这条连接要写进 `vendor.meta` 的血统键。
 * 第一条连接（key 就是 root）返回 `{}` —— 它不需要指路，它自己就是根。
 */
export function siblingConnectionLineageMeta(vendorKey: string): Record<string, unknown> {
  const root = builtinVendorKeyOfKey(vendorKey);
  if (!root || root === vendorKey) return {};
  return { [ADAPTER_CANDIDATE_ROOT_VENDOR_KEY]: root };
}
