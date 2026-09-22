/**
 * 「这次保存该落在哪条连接上」的**唯一**派生（issue #831）。
 *
 * 守的不变量：**一条连接的身份 = 域名 + 连接名，且这个判断只有一处。**
 *
 * 改之前，身份 = 域名（`deriveVendorKeyFromBaseUrl`），六个调用点各自从 baseUrl 反查一次。
 * 那在「域名 → key」是双射时能工作；#831 之后不再是双射（同一个中转站可以有三条连接），
 * 六处会各自**静默选到 host 那条**。所以从 baseUrl 得到 key 的路只留这一条，六处全走它。
 *
 * 为什么住 `electron/catalog/` 而不是 `electron/shared/`：host 步要查「内置 host 别名表」
 * （`builtinVendorKeyForHostname`），那张表是从 19 个 vendor seed 模块派生出来的。把它
 * 提到中立契约层 = 渲染层一 import 就把 19 个种子模块拖进浏览器 bundle，正是 .dependency-cruiser
 * 的 R-B5 注释里记着的那次白屏（#614）的成因。**六个调用方全在主进程**，所以派生住主进程侧；
 * 渲染层需要的那半（「这条 key 属于谁」）住 `electron/shared/builtinVendorIdentity.ts`，
 * 两边共用同一套 key 形状常量。
 *
 * `deriveVendorKeyFromBaseUrl` 自此**只是本模块内部的 host 步**，不许别处再直接调
 * （`scripts/check-builtin-vendor-literals.mjs` 盯着）。
 */
import { composeConnectionVendorKey, slugifyConnectionName } from "../shared/builtinVendorIdentity";
import { deriveVendorKeyFromBaseUrl } from "./catalogCommit";

export type ConnectionVendorKeyInput = {
  /** 用户填的接入地址。首次接入时目录里还没有这条 vendor，从它派生 host 段是合法的。 */
  baseUrl?: string | null;
  /** 用户填的「来源名称」。空 = 按「更新那条 host 连接」处理（见下）。 */
  name?: string | null;
  /** 目录里现有的 vendor（只用到 key）。 */
  vendors: readonly { key: string }[];
  /** 调用方手里已经有的连接身份（编辑既有连接 / 上游传下来的）。给了就按它，不再派生。 */
  catalogVendorKey?: string | null;
};

/**
 * host 步：给了 `catalogVendorKey` 就是它，否则从 baseUrl 派生 host 段。
 *
 * 「拿 baseUrl 反查连接」的那几扇门（模型发现 / 凭据读写 / 认证启动）用它：首次接入时目录里
 * 还没有这条 vendor，从地址派生是**合法**的，盲抛才是错的。它们拿到的是「这一族的 root」，
 * 具体落在哪条兄弟连接上由 {@link resolveConnectionVendorKey} 在写入侧决定。
 */
export function resolveHostVendorKey(input: Pick<ConnectionVendorKeyInput, "baseUrl" | "catalogVendorKey">): string {
  const explicit = String(input.catalogVendorKey ?? "").trim();
  if (explicit) return explicit;
  const hostKey = deriveVendorKeyFromBaseUrl(String(input.baseUrl ?? ""));
  if (!hostKey) throw new Error("Unable to derive a provider id from the API base URL");
  return hostKey;
}

/**
 * 解析这次操作落在哪个 vendorKey 上。
 *
 * 规则（拍板 2026-09-22，详见 docs/plan/2026-09-22-vendor-connection-identity.md §4.1）：
 *   1. 给了 `catalogVendorKey` → 就是它（= 编辑既有连接，不许被名字改动带跑）。
 *   2. host 段还没被占 → 返回 host 段本身。**与改之前逐字相同 = 存量目录零迁移。**
 *   3. host 段已被占 + 连接名 slug 非空 → `host--slug`。
 *      该 key 已存在 = 同域名同名 = **更新那条连接**（不加 `-2` 后缀，这是拍板 1 的直接后果）。
 *   4. host 段已被占 + 连接名为空或 slug 化后为空（纯中文名/纯符号）→ 回落到 host 段，
 *      即「更新那条 host 连接」。UI 在这种情况下显示的是「保存会更新连接「X」的 Key」那一句，
 *      两边必须是同一条判据，否则提示说的和实际做的不是一回事。
 *
 * 只有「既没有 catalogVendorKey、也没有可解析的 baseUrl」才抛——那种情况下确实无从得知
 * 该写哪一行，猜一个默认就是 #831 的老路（P1 不留逃生口）。
 */
export function resolveConnectionVendorKey(input: ConnectionVendorKeyInput): string {
  const hostKey = resolveHostVendorKey(input);
  if (input.catalogVendorKey && String(input.catalogVendorKey).trim()) return hostKey;

  const taken = new Set(input.vendors.map((vendor) => vendor.key));
  if (!taken.has(hostKey)) return hostKey;

  const sibling = composeConnectionVendorKey(hostKey, String(input.name ?? ""));
  // slug 为空（纯中文名/纯符号/没填）→ 按「更新那条 host 连接」走，见规则 4。
  return sibling || hostKey;
}

/**
 * 这次保存会**新建**一条连接，还是**更新**已有的那条？UI 的提示行与写入侧共用这一条判据。
 * 返回被命中的那条已有连接的 key（= 更新），或 null（= 新建）。
 */
export function connectionUpdateTarget(input: ConnectionVendorKeyInput): string | null {
  const key = resolveConnectionVendorKey(input);
  return input.vendors.some((vendor) => vendor.key === key) ? key : null;
}

export { slugifyConnectionName };
