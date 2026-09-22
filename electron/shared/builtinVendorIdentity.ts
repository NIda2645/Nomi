/**
 * 一条**连接**的身份词汇表（issue #831）。中立契约层：渲染层与主进程共用同一份，
 * 且**只依赖字符串 + vendorLineage**，不碰 builtinVendorSeeds（那一支会把 19 个种子模块
 * 拖进浏览器 bundle，正是 R-B5 注释里那次白屏的成因）。
 *
 * 守的不变量：**「这条 vendor 属于谁」只有一种问法。**
 *
 * 起因：连接身份原本 = 域名（`deriveVendorKeyFromBaseUrl` 只看 hostname），于是同一个中转站
 * 的三个计价分组（同地址、不同 Key）算出同一个 vendorKey，第二次保存把第一条连接的名字和
 * Key 当场覆盖（#831）。改成「域名 + 连接名」之后 key 会长出 `apimart--mini` 这种形状，
 * 而全仓有 16 处在用 `vendor.key === "apimart"` 这类**字面量**判断「这是不是某个内置家」——
 * 它们会集体认不出第二条连接。所以身份解析必须收进这一份，字面量比较一处不留（P1）。
 *
 * key 的形状（两档，刻意不对称，理由见 docs/plan/2026-09-22-vendor-connection-identity.md §4.1）：
 *   · 第一条连接        `apimart` / `gw-example-com`      ← 与今天逐字相同，存量目录零迁移
 *   · 之后的兄弟连接    `apimart--mini`                    ← root + 分隔符 + 连接名 slug
 *   · 认证候选（既有）  `apimart--candidate-<16hex>`       ← stagedVendorKey，同一族形状
 */
import { resolvedVendorLineageRoot, type VendorLineageEntry } from "./vendorLineage";

/**
 * 调用点手里的 vendor 形状五花八门（目录行 / bridge DTO / 投影），`key` 常是 `string | undefined`。
 * 收口成一个宽入参，省得每个调用点自己 map 一遍（那又会长出 N 份同样的适配代码）。
 */
export type VendorIdentityEntry = { key?: string | null; meta?: unknown };

function lineageEntries(vendors: readonly VendorIdentityEntry[]): VendorLineageEntry[] {
  const entries: VendorLineageEntry[] = [];
  for (const vendor of vendors) {
    const key = String(vendor?.key ?? "").trim();
    if (key) entries.push({ key, meta: vendor?.meta });
  }
  return entries;
}

/** 回环 host：同一台机器上多个本地后端按**端口**分家（ComfyUI 8188 / Ollama 11434 不是同一个地址）。 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

/**
 * 两个 baseUrl 算不算「同一个接入地址」——比较用的范围串。
 *
 * 与 `deriveVendorKeyFromBaseUrl` 的 host 步**同一条规则**：普通域名只看 hostname，
 * 回环地址连端口一起看。不这么做的话，添加表单会对着 `127.0.0.1:11434` 说
 * 「此地址已有连接「本地 ComfyUI」（:8188）」——一句准确的谎话（D4 诚实交付）。
 *
 * 解析不出来（用户还在打字）返回空串，调用方据此保持安静。
 */
export function connectionHostScope(baseUrl: string | null | undefined): string {
  const value = String(baseUrl ?? "").trim();
  if (!value) return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) return "";
  return LOOPBACK_HOSTS.has(host) ? `${host}:${parsed.port || "80"}` : host;
}

/** root 与连接名之间的分隔符。用双连字符是为了和 host 自己的连字符分得开（`gw-example-com`）。 */
export const CONNECTION_KEY_SEPARATOR = "--";

/** `stagedVendorKey` 的候选段前缀；连接名 slug 不许和它撞（见 slugifyConnectionName）。 */
const CANDIDATE_SEGMENT_PREFIX = "candidate";

/** slug 最长多少字符。够区分、又不至于让 key 长到没法读。 */
const MAX_SLUG_LENGTH = 24;

/**
 * 连接名 → key 里那一段 slug。
 *
 * 只保留 ASCII 字母数字；中日韩字符不做 punycode（那会让 key 彻底不可读，而 key 是要进
 * 导出文件、偏好列表和排查日志的）。于是「满血组」这类纯中文名 slug 为空，走兜底：
 * 空 slug 交由调用方按「同名」处理（= 更新那条已有连接），这是拍板里 `名称为空且域名已被占`
 * 那一条的同一条路径。
 */
export function slugifyConnectionName(name: string): string {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  if (!slug) return "";
  // `apimart--candidate-…` 是认证候选的保留形状；用户把连接命名成 "candidate" 时
  // 不能让它伪装成候选（那会被 planStagedVendorIdentity 当成待淘汰的行删掉）。
  return slug.startsWith(CANDIDATE_SEGMENT_PREFIX) ? `n-${slug}` : slug;
}

/** root + 连接名 → 兄弟连接的 key。slug 为空时返回空串（= 调用方该走「同名」那一支）。 */
export function composeConnectionVendorKey(rootVendorKey: string, connectionName: string): string {
  const root = String(rootVendorKey ?? "").trim();
  const slug = slugifyConnectionName(connectionName);
  if (!root || !slug) return "";
  return `${root}${CONNECTION_KEY_SEPARATOR}${slug}`;
}

/**
 * 纯字符串解析：这个 key 的 root 段是什么。
 *
 * 给**拿不到 vendors 列表**的调用点用（mapping 行、节点 meta 里的裸 vendor 字符串）。
 * 它只认 key 的形状，不读 lineage 元数据——所以它答不出「用户手工改过血统」的情形。
 * 能拿到 vendors 列表的地方一律用 {@link resolveBuiltinVendorKey}，别用这个。
 */
export function builtinVendorKeyOfKey(vendorKey: string | null | undefined): string {
  const key = String(vendorKey ?? "").trim();
  if (!key) return "";
  const at = key.indexOf(CONNECTION_KEY_SEPARATOR);
  return at > 0 ? key.slice(0, at) : key;
}

/**
 * 这条 vendor 最终属于哪个身份（lineage 优先，退回 key 形状）。
 *
 * 复用 `resolvedVendorLineageRoot` —— 兄弟连接写的是 `adapterCandidateRootVendorKey`，
 * 认证候选写的是 source+root，两者在这里都会解析回同一个 root。vendors 里查不到这条
 * （例如刚被删掉、或调用方手里只有 key）时退回字符串解析，不静默返回空。
 */
export function resolveBuiltinVendorKey(
  vendors: readonly VendorIdentityEntry[],
  vendorKey: string | null | undefined,
): string {
  const key = String(vendorKey ?? "").trim();
  if (!key) return "";
  const root = resolvedVendorLineageRoot(lineageEntries(vendors), key);
  return builtinVendorKeyOfKey(root || key);
}

/**
 * 「这条 vendor 是不是 <builtin>」的**唯一**问法。
 *
 * 取代全仓 16 处 `vendor.key === "apimart"` / `BUILTIN_RELAY_VENDOR_KEYS.has(key)`：
 * 那些判据在兄弟连接（`apimart--mini`）上一律答错，症状是「接了 APIMart 特价组，
 * 但上传通道 / 图生图 / 推荐徽章全没了」。
 */
export function isVendorOfBuiltin(
  vendors: readonly VendorIdentityEntry[],
  vendorKey: string | null | undefined,
  builtin: string,
): boolean {
  if (!builtin) return false;
  return resolveBuiltinVendorKey(vendors, vendorKey) === builtin;
}

/**
 * 两条 key 是不是同一个身份（不管谁是第一条、谁是兄弟连接）。
 * 给「节点上记的 vendor」对「目录里那条 vendor」这类比较用。
 */
export function sameVendorIdentity(
  vendors: readonly VendorIdentityEntry[],
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = resolveBuiltinVendorKey(vendors, left);
  const b = resolveBuiltinVendorKey(vendors, right);
  return Boolean(a) && a === b;
}
