/**
 * 试跑一次（F3）。**这是这条路上唯一花钱的动作**，也是唯一能把
 * `unverified: model_produces_output` 消掉的证据。
 *
 * ── 为什么非有它不可 ─────────────────────────────────────────────────────────────
 * 写代码的人每次都能接进来，第四件本事是「跑一下，看供应商吐的真话，再改」。今天 MCP 这条路
 * 上没有这一步，于是 AI 只能盲改：它拿到的永远是我们归一化后的分类码，看不到上游原文。
 * 先查别人也指向同一处：Coze 的插件导入把「Debug 页真跑一次、跑通才能 Done」做成了必经步骤。
 *
 * ── 它走哪条执行器、钱谁把关 ─────────────────────────────────────────────────────
 * 执行器 = `runtime.runTask`，**和用户在画布上点一下生成是同一条**（vendor 无关，按
 * `selectTaskMapping` 派发）。刻意不走 Run 路径：那条今天只认 APIMart 一家。
 * 钱闸也是那一条：`spendGrant` → 渲染层报价确认卡。这里铸的令牌**不带报价**，所以
 * `assertAndConsumeQuotedSpend` 一定会走到 `confirm()`——也就是一定会去问用户。
 * 模型调得动这个工具，但结不了这笔账：确认按钮在用户自己的 Nomi 窗口里。
 * Nomi 窗口不在（纯 headless 宿主）时，这一跳**诚实失败**，不偷偷放行。
 *
 * ── 回传什么 ────────────────────────────────────────────────────────────────────
 * 供应商的原始响应**脱敏后原样**回传（`sanitizedAdapterJson`）。不改写、不翻译、不只给分类码：
 * 那正是 AI 自己收敛所需要的东西。脱敏是硬的——`redactAdapterSecrets` 是全仓同一份。
 */
import { readCatalog } from "../../catalog/catalogStore";
import { selectTaskMapping, type ProfileKind } from "../../catalog/types";
import { mintSpendGrant, isSpendAuthorizationError } from "../../spendGrant";
import { sanitizedAdapterJson, redactAdapterSecrets } from "../../providerAdapter/redaction";
import type { RunTaskFn } from "../core";
import { billableRequests, noBlast, unverified, type OnboardingFailure, type OnboardingResult } from "./envelope";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** 没给提示词时用的那一句：短、中性、任何模型都答得出来。 */
const NEUTRAL_PROMPT = "A single red apple on a plain white table, soft daylight";

export type TryModelDeps = { runTask: RunTaskFn };

export async function tryModel(
  deps: TryModelDeps,
  args: Record<string, unknown>,
): Promise<OnboardingResult | OnboardingFailure> {
  const vendorKey = text(args.vendorKey);
  const modelKey = text(args.modelKey);
  const catalog = readCatalog();
  const vendor = catalog.vendors.find((row) => row.key === vendorKey);
  const model = catalog.models.find((row) => row.vendorKey === vendorKey && row.modelKey === modelKey);
  if (!vendor || !model) {
    return {
      ok: false, code: "not_found",
      message: `Nomi has no model ${modelKey || "(missing modelKey)"} on connection ${vendorKey || "(missing vendorKey)"}.`,
      nextAction: "Call nomi_read target=models and use the exact vendor and model ids it returns, or submit the declaration first.",
    };
  }
  const declaredKinds = catalog.mappings
    .filter((mapping) => mapping.enabled && mapping.vendorKey === vendorKey && mapping.modelKey === modelKey)
    .map((mapping) => mapping.taskKind);
  const taskKind = (text(args.taskKind) || declaredKinds[0] || "") as ProfileKind;
  if (!taskKind) {
    return {
      ok: false, code: "needs_input",
      message: `Nothing is declared for ${modelKey}, so there is no mode to try.`,
      needs: ["a submitted declaration for this model"],
      nextAction: "Send the card with action=submit_declaration first; nomi_read target=onboarding_kit has the schema and two examples.",
    };
  }
  if (!selectTaskMapping(catalog.mappings, vendorKey, taskKind, modelKey)) {
    return {
      ok: false, code: "not_found",
      message: `${modelKey} has no enabled ${taskKind} mode on ${vendorKey}. Declared modes: ${declaredKinds.join(", ") || "none"}.`,
      nextAction: "Pass one of the declared taskKinds, or add that mode to the card and submit it again.",
    };
  }
  if (!catalog.apiKeysByVendor[vendorKey]?.apiKey) {
    return {
      ok: false, code: "needs_input",
      message: `${vendor.name} has no saved key, so nothing can be sent.`,
      needs: ["an API key on this connection"],
      nextAction: "Either call connect_provider with this vendorKey so the user pastes it on Nomi's own page, or, if the user handed you the key, call action=set_key.",
    };
  }

  // 一个节点、一次机会：试跑不给重试预算。想再试一次就再调一次，而那会再问用户一次。
  const nodeId = `try-${vendorKey}-${Date.now()}`;
  const grantId = mintSpendGrant({ nodeIds: [nodeId], maxAttemptsPerNode: 1, ttlMs: 30 * 60 * 1000 });
  const params = (args.params && typeof args.params === "object" && !Array.isArray(args.params))
    ? (args.params as Record<string, unknown>)
    : {};
  let result;
  try {
    result = await deps.runTask({
      vendor: vendorKey,
      request: {
        kind: taskKind,
        prompt: text(args.prompt) || NEUTRAL_PROMPT,
        extras: { ...params, modelKey, modelAlias: modelKey, nodeId, grantId },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSpendAuthorizationError(error) || /RendererUnavailable|Nomi 窗口/.test(message)) {
      return {
        ok: false, code: "needs_input",
        message: "The user did not confirm this charge in Nomi, so nothing was sent.",
        needs: ["the user to confirm the cost in Nomi's own window"],
        nextAction: "Ask the user to open Nomi and confirm the generation card, then call nomi_try_model again. Nomi never spends the user's credit on a tool call alone.",
      };
    }
    return {
      ok: false, code: "provider_failed",
      message: `The test generation failed before it produced anything: ${redactAdapterSecrets(message, 600)}`,
      evidence: { bodyExcerpt: redactAdapterSecrets(message, 512) },
      nextAction: "Read the message against the documentation URL the card declared for that mode, fix the field it names, and submit the card again.",
    };
  }

  const assets = Array.isArray(result.assets) ? result.assets : [];
  const succeeded = result.status === "succeeded" && assets.length > 0;
  const origin = new URL(String(vendor.baseUrlHint || "https://invalid.invalid")).origin;
  const upstream = sanitizedAdapterJson(result.raw).slice(0, 20_000);
  if (!succeeded) {
    return {
      ok: false, code: "provider_failed",
      message: `The provider did not produce anything: status=${result.status || "unknown"}${result.error ? `, ${redactAdapterSecrets(result.error, 300)}` : ""}.`,
      evidence: { bodyExcerpt: upstream.slice(0, 512) },
      nextAction: "The provider's own response is in evidence.bodyExcerpt. Fix the field it points at and submit the whole card again, then try once more.",
    };
  }
  return {
    ok: true,
    vendorKey,
    state: {
      vendorKey,
      modelKey,
      taskKind,
      status: result.status,
      assets: assets.map((asset) => ({ type: asset.type, url: asset.url })),
      /** 上游原文（脱敏后原样）。AI 自己收敛靠的就是这一段，不是我们的分类码。 */
      providerResponse: upstream,
    },
    // 跑出产物了 → `model_produces_output` 这一格消掉；上传通道仍然没被证明过。
    unverified: unverified("asset_upload_works"),
    changes: [{ state: "S11.5", summary: `${modelKey} produced one artifact on ${taskKind}.` }],
    blastRadius: { ...noBlast(), outboundRequests: billableRequests(origin) },
    nextAction: {
      kind: "none",
      userSees: `${model.labelZh || modelKey} produced an artifact. It is usable in Nomi's model pickers now.`,
    },
  };
}
