/**
 * 凭据绑定：**用户按下「保存」那一刻，这把 key 被绑在哪个 origin 上**。
 *
 * ── 它在解决哪个真实摩擦（docs/plan/2026-09-18-agent-model-onboarding.md §6.1）──
 *
 * 一段未签名的对话文本（Agent 交来的地址、旧版本写进盘的 catalog、手改的 model-catalog.json）
 * 不该决定用户的密钥发往哪里。这是 Cherry Studio 的铁律，九家先例里没有一家例外。
 * 在这之前本仓只有**校验器**一层挡同源（`validateProviderAdapterDraft`）——它只看得见
 * 「这一次收进来的卡」，看不见旧数据、看不见手改的文件、也看不见将来第二个写入口。
 *
 * 所以不变量落在两处、都是机器判据：
 *   · **绑定时**：写 key 的那一个事务里（`applyApiKeyUpsert`，catalog 的唯一 key 写门）
 *     把当时 vendor 行上的「地址 + key 怎么放」快照成 `meta.credentialBinding`。
 *   · **发送时**：`authorizeSubmitDestination` —— 带 key 的请求 origin 必须等于绑定 origin
 *     （或代码里写死的官方备用域）。这一层同时罩住 customCall 脚本，因为它也走 `vendorHttp`。
 *
 * 绑定**不是** vendor 行的第二份地址真相源：`baseUrlHint` 仍然是「请求发到哪」的唯一来源，
 * 绑定只回答「用户当时看见并同意的是哪一个」。两者不一致 = 有人在用户没看见的时候改了地址，
 * 那正是要拦的那件事。
 */
import type { CredentialBinding, Vendor } from "./types";

/** 「key 去哪、怎么放」的全部字段。改动它们 = 必须重走一次贴 key 页。 */
export const CREDENTIAL_DESTINATION_FIELDS = Object.freeze([
  "baseUrlHint",
  "authType",
  "authHeader",
  "authQueryParam",
  "authScheme",
  "proxyUrl",
] as const);

/**
 * 绑定里**真正被判据用到**的那几个字段（Ponytail 2026-09-18）。
 *
 * 「记下来但没有人判」正是这条不变量要杀的那个形状，所以绑定上不留这样的字段：
 * `proxyUrl` 曾经以一个 `proxied` 布尔的形式记在这里而从不参与授权——而且代理开关是
 * `connect_provider` **明确允许**的合法动作，把它记成绑定的一部分会让一次合法操作看起来像违规。
 * 它已经删掉。剩下的四个全部在 `judgeCredentialDestination` 里判。
 */
export const ENFORCED_BINDING_FIELDS = Object.freeze(["origin", "authType", "authHeader", "authQueryParam", "authScheme"] as const);

/** MCP 工具面上一律不许出现的入参名（`check:credential-origin` 判据 ②）。 */
export const CREDENTIAL_DESTINATION_TOOL_FIELDS = Object.freeze([
  "baseUrl",
  ...CREDENTIAL_DESTINATION_FIELDS,
] as const);

export type { CredentialBinding };

function originOf(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

/** 从一行 vendor 派生「此刻的去向」。保存 key 的事务用它做快照；守卫用它比对。 */
export function deriveCredentialBinding(
  vendor: Pick<Vendor, "baseUrlHint" | "authType" | "authHeader" | "authQueryParam" | "authScheme" | "network"> | undefined,
  confirmedAt: string,
): CredentialBinding {
  return {
    origin: originOf(vendor?.baseUrlHint),
    ...(vendor?.authType ? { authType: String(vendor.authType) } : {}),
    ...(vendor?.authHeader ? { authHeader: String(vendor.authHeader) } : {}),
    ...(vendor?.authQueryParam ? { authQueryParam: String(vendor.authQueryParam) } : {}),
    ...(vendor?.authScheme ? { authScheme: String(vendor.authScheme) } : {}),
    confirmedAt,
  };
}

/**
 * 读回绑定。**读不到就是没有绑定**（旧装机、curated 种子、ComfyUI 连接），
 * 没有绑定 ⇒ 这条判据不成立，交回给既有的私网/声明 origin 策略去判——
 * 不许把「不知道」当成「拒绝」（那会把一整代老装机的模型全判死）。
 */
export function readCredentialBinding(vendor: Pick<Vendor, "credentialBinding"> | undefined): CredentialBinding | undefined {
  const raw = vendor?.credentialBinding as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.origin !== "string" || typeof record.confirmedAt !== "string") return undefined;
  const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);
  return {
    origin: record.origin,
    ...(text(record.authType) ? { authType: text(record.authType) as string } : {}),
    ...(text(record.authHeader) ? { authHeader: text(record.authHeader) as string } : {}),
    ...(text(record.authQueryParam) ? { authQueryParam: text(record.authQueryParam) as string } : {}),
    ...(text(record.authScheme) ? { authScheme: text(record.authScheme) as string } : {}),
    confirmedAt: record.confirmedAt,
  };
}

/**
 * 两份绑定说的是同一件事吗（`confirmedAt` 不算——它是时刻，不是去向）。
 *
 * key 写入事务据此决定要不要落盘：同一条连接重存一次同一把 key，不该把 `updatedAt` 抖一下
 * （「vendor 本就停用时不重写它」那条不变量靠的就是没有无谓写入）。
 */
export function sameCredentialDestination(left: CredentialBinding | undefined, right: CredentialBinding): boolean {
  if (!left) return false;
  return ENFORCED_BINDING_FIELDS.every((field) => (left[field] ?? "") === (right[field] ?? ""));
}

export type CredentialDestinationVerdict =
  | { allowed: true }
  /** `changed` 说清**是哪一样变了**：地址，还是 key 的放法——两者给用户的下一句话不同。 */
  | { allowed: false; boundOrigin: string; attemptedOrigin: string; changed: "origin" | "authType" | "authHeader" | "authQueryParam" | "authScheme" };

/**
 * 带 key 的这次请求，目的地是用户确认过的那个吗。
 *
 * 允许的集合只有两样：绑定 origin 本身，以及**代码里写死**的官方备用域
 * （`vendorBaseFallback` 的 FAMILIES——那是编译进包的声明，不是数据）。
 * 预签名上传那种动态目标不带 key（`catalog/types.ts` 的策略注释），不走这条判据。
 */
export function judgeCredentialDestination(input: {
  binding: CredentialBinding | undefined;
  url: string;
  codeDeclaredOrigins: readonly string[];
  /** 这次请求实际要用的鉴权放法（vendor 行上的那几个字段）。 */
  placement?: Pick<Vendor, "authType" | "authHeader" | "authQueryParam" | "authScheme">;
}): CredentialDestinationVerdict {
  const binding = input.binding;
  if (!binding || !binding.origin) return { allowed: true };
  const attempted = originOf(input.url);
  if (!attempted) return { allowed: true };
  const originAllowed = attempted === binding.origin || input.codeDeclaredOrigins.includes(attempted);
  if (!originAllowed) return { allowed: false, boundOrigin: binding.origin, attemptedOrigin: attempted, changed: "origin" };
  // 「改变这个 origin **或 key 的放法**，只能再走一次贴 key 页」——后半句以前只写在不变量里、
  // 没有人判（Ponytail 2026-09-18）。放法变了而 key 没重存，就是「这把 key 以用户没确认过的方式
  // 被送出去」，和换地址是同一件事：同一把钥匙，换了一个信封。
  const placement = input.placement;
  if (placement) {
    const drifted = (["authType", "authHeader", "authQueryParam", "authScheme"] as const)
      .find((field) => String(placement[field] ?? "") !== String(binding[field] ?? ""));
    if (drifted) {
      return { allowed: false, boundOrigin: binding.origin, attemptedOrigin: attempted, changed: drifted };
    }
  }
  return { allowed: true };
}

/**
 * 保存 key 的那个事务里记下「这把 key 去哪」。**catalog 的 key 写门是唯一调用者**
 * （`applyApiKeyUpsert`）——判据写在这里而不是写在写门里，是为了让 `catalogStore` 那个已知巨壳
 * 只减不增，也让「绑定怎么算」与「绑定存哪」在同一个文件里读得完。
 *
 * 去向没变就不写：同一条连接重存同一把 key 不该把 `updatedAt` 抖一下
 *（`credentialPublication.test.ts` 的「本就停用时不重写它」守的正是这个）。
 */
export function bindCredentialDestination(
  vendor: (Parameters<typeof deriveCredentialBinding>[0] & { credentialBinding?: CredentialBinding }) | undefined,
  at: string,
): void {
  if (!vendor) return;
  const binding = deriveCredentialBinding(vendor, at);
  if (!sameCredentialDestination(vendor.credentialBinding, binding)) vendor.credentialBinding = binding;
}

/**
 * vendor upsert 的 payload 想改绑定吗。
 *
 * 两种可能：① `{ ...existingVendor, enabled }` 这种原样转抄（无意图，放行）；
 * ② 真的想改它——那就是「让数据决定 key 去哪」，大声拒绝，不静默丢掉。
 */
export function assertNoCredentialBindingRewrite(incoming: unknown, existing: CredentialBinding | undefined): void {
  if (incoming === undefined) return;
  if (JSON.stringify(incoming) === JSON.stringify(existing)) return;
  throw new Error("credentialBinding is written only when a key is saved; it is not part of a vendor upsert payload");
}
