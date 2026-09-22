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
import {
  CONNECTION_KEY_SEPARATOR,
  builtinVendorKeyOfKey,
  composeConnectionVendorKey,
  slugifyConnectionName,
} from "../shared/builtinVendorIdentity";
import { ADAPTER_CANDIDATE_ROOT_VENDOR_KEY } from "../shared/vendorLineage";
import { deriveVendorKeyFromBaseUrl } from "./catalogCommit";

export type ConnectionVendorKeyInput = {
  /** 用户填的接入地址。首次接入时目录里还没有这条 vendor，从它派生 host 段是合法的。 */
  baseUrl?: string | null;
  /**
   * 调用方手里**已经算好的 root**（host 段）。给了就用它，不再从 baseUrl 重算一遍。
   * 写入侧（serviceCatalog.register）走这一支：root 是上游 `registration.ts` 解析好的，
   * 这里只负责「被占了就追加连接名」那一步 —— 同一条 key 不许被两处各算一遍（P1）。
   */
  rootVendorKey?: string | null;
  /** 用户填的「来源名称」。空 = 按「更新那条 host 连接」处理（见下）。 */
  name?: string | null;
  /**
   * 目录里现有的 vendor。**名字是判据的一部分**：「同域名同名 = 更新那条」比的是
   * 已有连接的**名字**，不是 key 空间 —— 第一条连接的 key 是裸 root，它的名字却可能是
   * 任何东西（`saved-gateway` / 「满血组」）。只比 key 会把「重新保存同一条连接」
   * 误判成「新建一条兄弟」，凭据随即找不到（registrationCatalog 那条测试抓到的就是这个）。
   */
  vendors: readonly { key: string; name?: string | null }[];
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
export function resolveHostVendorKey(
  input: Pick<ConnectionVendorKeyInput, "baseUrl" | "catalogVendorKey" | "rootVendorKey">,
): string {
  const explicit = String(input.catalogVendorKey ?? "").trim();
  if (explicit) return explicit;
  const given = String(input.rootVendorKey ?? "").trim();
  if (given) return given;
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
 *   3. host 段已被占 + 连接名 slug 非空：
 *      · 这一族里已有**同名**的那条（按名字比，不是按 key 比）→ 就是它，**更新**它；
 *      · 否则 → `host--slug`，新建一条兄弟连接（不加 `-2` 后缀，这是拍板 1 的直接后果）。
 *   4. host 段已被占 + 连接名为空或 slug 化后为空（纯中文名/纯符号）→ 回落到 host 段，
 *      即「更新那条 host 连接」。UI 在这种情况下显示的是「保存会更新连接「X」的 Key」那一句，
 *      两边必须是同一条判据，否则提示说的和实际做的不是一回事。
 *
 * 只有「既没有 catalogVendorKey、也没有 rootVendorKey、也没有可解析的 baseUrl」才抛——那种情况下确实无从得知
 * 该写哪一行，猜一个默认就是 #831 的老路（P1 不留逃生口）。
 */
export function resolveConnectionVendorKey(input: ConnectionVendorKeyInput): string {
  const hostKey = resolveHostVendorKey(input);
  // 明确给了身份 = 编辑既有连接，名字改动不许把它带跑。
  if (String(input.catalogVendorKey ?? "").trim()) return hostKey;

  // 这一族 = root 那条 + 它的兄弟连接。
  const family = input.vendors.filter(
    (vendor) => vendor.key === hostKey || vendor.key.startsWith(`${hostKey}${CONNECTION_KEY_SEPARATOR}`),
  );
  if (family.length === 0) return hostKey;

  const slug = slugifyConnectionName(String(input.name ?? ""));
  // slug 为空（纯中文名/纯符号/没填）→ 按「更新那条 root 连接」走，见规则 4。
  if (!slug) return hostKey;

  // 同名 = 就是那一条（不管它的 key 是裸 root 还是兄弟形状）。
  const sameName = family.find((vendor) => slugifyConnectionName(String(vendor.name ?? "")) === slug);
  if (sameName) return sameName.key;

  return composeConnectionVendorKey(hostKey, String(input.name ?? "")) || hostKey;
}

/**
 * 这次保存会**新建**一条连接，还是**更新**已有的那条？UI 的提示行与写入侧共用这一条判据。
 * 返回被命中的那条已有连接的 key（= 更新），或 null（= 新建）。
 */
export function connectionUpdateTarget(input: ConnectionVendorKeyInput): string | null {
  const key = resolveConnectionVendorKey(input);
  return input.vendors.some((vendor) => vendor.key === key) ? key : null;
}

/**
 * 兄弟连接（同域名、不同连接名）要写进 `vendor.meta` 的血统键。
 *
 * 为什么**复用** `vendorLineage` 的既有字段、不另造一套：`resolvedVendorLineageRoot` 已经是
 * 「从任意 vendor key 解析回它的根」的唯一 owner，全仓都走它；再造一套 = 两份真相。
 *
 * 兄弟连接只写 `adapterCandidateRootVendorKey`，**刻意不写** `adapterCandidateSourceVendorKey`：
 * `isCandidateVendor()` 判的正是 source 有没有值。写了 source，这条兄弟连接就会被
 * `planStagedVendorIdentity` 当成「待淘汰的认证候选」扫进 supersededVendorKeys 删掉
 * —— 那正是 #831 红测试 (b) 的那条断言。
 *
 * 于是同一份 lineage 里天然分开两种语义：
 * 有 source = 替换候选（新版本要顶掉旧版本）｜只有 root = 兄弟连接（共存，互不为前任）。
 *
 * 第一条连接（key 就是 root）返回 `{}` —— 它不需要指路，它自己就是根。
 */
export function siblingConnectionLineageMeta(vendorKey: string): Record<string, unknown> {
  const root = builtinVendorKeyOfKey(vendorKey);
  if (!root || root === vendorKey) return {};
  return { [ADAPTER_CANDIDATE_ROOT_VENDOR_KEY]: root };
}
