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
    ...(vendor?.network?.proxyUrl ? { proxied: true } : {}),
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
    ...(record.proxied === true ? { proxied: true } : {}),
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
  const shape = (value: CredentialBinding): string => JSON.stringify({
    origin: value.origin,
    authType: value.authType ?? "",
    authHeader: value.authHeader ?? "",
    authQueryParam: value.authQueryParam ?? "",
    authScheme: value.authScheme ?? "",
    proxied: value.proxied === true,
  });
  return shape(left) === shape(right);
}

export type CredentialDestinationVerdict =
  | { allowed: true }
  | { allowed: false; boundOrigin: string; attemptedOrigin: string };

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
}): CredentialDestinationVerdict {
  const binding = input.binding;
  if (!binding || !binding.origin) return { allowed: true };
  const attempted = originOf(input.url);
  if (!attempted) return { allowed: true };
  if (attempted === binding.origin) return { allowed: true };
  if (input.codeDeclaredOrigins.includes(attempted)) return { allowed: true };
  return { allowed: false, boundOrigin: binding.origin, attemptedOrigin: attempted };
}
