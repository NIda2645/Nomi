/**
 * 整份卡一次提交（F2）。**没有句柄、没有阶段、不要求先有 key。**
 *
 * ── 删掉的三堵墙（S1/S2/S3，用户 09-21 的裁决：证明不了提高成功率就真删）───────────────
 * ① schema 要等 `credentialStatus=ready` 才投影 → 现在 `nomi_read target=onboarding_kit` 无前置就给；
 * ② 提交要带 `setupId` 且会话得在对的阶段 → 现在卡自带身份（`provider.baseUrl` 派生连接 id）；
 * ③ 提交前必须先有 key → 整张卡的校验（zod / 同源 / 模板根 / 可执行字段黑名单 /
 *    async-without-query / 参考图槽）**一个字节的 key 都不需要**，§5 原型已实跑证明。
 * 三条删掉之后，仍然守着的东西一条没动：同源、模板根白名单、可执行字段黑名单、origin 绑定、
 * 出站守卫、免费自检——它们与「谁来交这张卡」正交。
 *
 * ── 自检分两句话说清 ─────────────────────────────────────────────────────────────
 * 「卡自己站不站得住」是纯函数，任何时候都能判；「这把 key 上游认不认」要有 key 才能问。
 * 没有 key 时不把前者的结论说成后者，也不把「还没问」说成「问过了没问题」——两件事各占
 * `unverified` 里自己那一格。
 */
import { probeAdapterCredential, checkAdapterModeContract } from "../../providerAdapter/selfCheck";
import { validateProviderAdapterDraft } from "../../providerAdapter/validator";
import { readCatalog } from "../../catalog/catalogStore";
import { readCredentialBinding } from "../../catalog/credentialBinding";
import { decryptApiKeyRecord } from "../../catalog/secrets";
import { deriveVendorKeyFromBaseUrl } from "../../catalog/catalogCommit";
import { DeclaredOriginRewriteError, registerDeclaredProvider } from "../../catalog/declaredProviderRegistration";
import type { Model } from "../../catalog/types";
import { isJsonRecord } from "../../jsonUtils";
import { changeIdFor } from "./fingerprint";
import {
  freeRequests,
  noBlast,
  noGenericContractFailure,
  unverified,
  type OnboardingFailure,
  type OnboardingRejection,
  type OnboardingResult,
} from "./envelope";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** 卡**自己声明**的出处（不是我们猜的那一条）。 */
function cardSourceUrl(card: unknown): string | undefined {
  if (!isJsonRecord(card)) return undefined;
  const sources = card.sources;
  if (!Array.isArray(sources) || sources.length === 0) return undefined;
  const first = sources[0];
  return isJsonRecord(first) && typeof first.url === "string" ? first.url : undefined;
}

/**
 * 校验器抛的一句话 → 卡上的位置 + 一个码。**不猜**：认不出位置就如实说「整张卡」。
 *
 * 分类**必须**分得开「卡写错了」与「顺序/前置不对」：把后者标成 `code:"schema"` 会让 AI
 * 去改一个本来就对的字段，改一万次都不会好（2026-09-21 K4 的死循环就是这么来的）。
 * 这条路上已经没有顺序了，所以这里只剩下真正的卡内容分类。
 */
export function rejectionsFromError(error: unknown, card: unknown): OnboardingRejection[] {
  const message = error instanceof Error ? error.message : String(error);
  const path = /\b([A-Za-z0-9_.-]+)\.(text_to_image|image_edit|text_to_video|image_to_video|text_to_audio|image_to_audio|transcribe|text_to_3d|image_to_3d|chat|prompt_refine|image_to_prompt)\.(create|query|result)\b/.exec(message);
  const code: OnboardingRejection["code"] =
    /same origin/i.test(message) ? "same_origin"
      : /requires referenceParam|referenceShape/i.test(message) ? "reference_slot_missing"
        : /asynchronous|without a query|declares result without query/i.test(message) ? "async_without_query"
          : /no executable request channel|media result mapping/i.test(message) ? "no_channel"
            : /assetIngestion|upload/i.test(message) ? "upload_strategy_unsupported"
              : "schema";
  return [{
    path: path ? `${path[1]}.${path[2]}.${path[3]}` : "declaration",
    code,
    message: message.slice(0, 600),
    ...(cardSourceUrl(card) ? { sourceUrl: cardSourceUrl(card) as string } : {}),
  }];
}

export async function submitDeclaration(
  args: Record<string, unknown>,
): Promise<OnboardingResult | OnboardingFailure> {
  let card: unknown;
  try {
    card = JSON.parse(String(args.declaration ?? ""));
  } catch (error) {
    return {
      ok: false, code: "declaration_rejected",
      message: "The declaration is not valid JSON.",
      rejections: [{ path: "declaration", code: "schema", message: error instanceof Error ? error.message.slice(0, 300) : "invalid JSON" }],
      nextAction: "Send the card again as one JSON object; nomi_read target=onboarding_kit returns the exact schema it must match, with two worked examples.",
    };
  }
  if (!isJsonRecord(card) || !Array.isArray(card.models) || card.models.length === 0) {
    return {
      ok: false, code: "declaration_rejected",
      message: "The declaration lists no models.",
      rejections: [{ path: "models", code: "schema", message: "models must contain at least one model" }],
      nextAction: "Describe at least one model, with its modelKey, labelZh, kind and one mode.",
    };
  }

  // 地址的权威来源：这条连接**已经绑过 key** 就是绑定那个 origin，否则才是卡自己声明的。
  // 顺序写反就等于让一段未签名的文本决定已存密钥发往哪里（§6.1）。
  const declaredBaseUrl = isJsonRecord(card.provider) ? text(card.provider.baseUrl) : "";
  if (!declaredBaseUrl) {
    return {
      ok: false, code: "declaration_rejected",
      message: "The declaration has no provider.baseUrl.",
      rejections: [{ path: "provider.baseUrl", code: "schema", message: "provider.baseUrl is required and must be an http(s) URL" }],
      nextAction: "Add the provider block; nomi_read target=onboarding_kit shows it in both examples.",
    };
  }
  const state = readCatalog();
  const vendorKey = text(args.vendorKey) || deriveVendorKeyFromBaseUrl(declaredBaseUrl);
  const existingVendor = state.vendors.find((vendor) => vendor.key === vendorKey);
  const binding = readCredentialBinding(existingVendor);

  let validated;
  try {
    validated = validateProviderAdapterDraft(card, {
      providerBaseUrl: binding?.origin || declaredBaseUrl,
      selectedModelKeys: card.models.map((model) => (isJsonRecord(model) ? String(model.modelKey ?? "") : "")),
    });
  } catch (error) {
    // 「这家根本表达不出来」与「这张卡写错了」是两种处境，给的下一步相反：前者改卡一万次
    // 都没用，出口是人写调用脚本。判据只认校验器自己打出来的那个标记，不猜。
    const message = error instanceof Error ? error.message : String(error);
    if (/no_generic_contract|no generic contract/i.test(message)) {
      return noGenericContractFailure(card.models.map((model) => (isJsonRecord(model) ? String(model.modelKey ?? "") : "")).join(", "));
    }
    return {
      ok: false, code: "declaration_rejected",
      message: "Nomi rejected the declaration.",
      rejections: rejectionsFromError(error, card),
      nextAction: "Fix the named field against the documentation URL you declared for it, then send the whole card again.",
    };
  }

  let registration;
  try {
    registration = registerDeclaredProvider({
      card: validated,
      ...(text(args.vendorKey) ? { vendorKey: text(args.vendorKey) } : {}),
      ...(text(args.name) ? { vendorName: text(args.name) } : {}),
    });
  } catch (error) {
    if (error instanceof DeclaredOriginRewriteError) {
      return {
        ok: false, code: "credential_origin_mismatch",
        message: error.message,
        nextAction: `Declare provider.baseUrl on ${error.boundOrigin}, or call connect_provider with vendorKey=${vendorKey} and reissueKey=true so the user can rebind the key on Nomi's own page.`,
      };
    }
    return {
      ok: false, code: "provider_failed",
      message: "Nomi could not write this declaration into the model catalog.",
      rejections: rejectionsFromError(error, card),
      nextAction: "Read the message, fix what it names and send the whole card again. Nothing was written: the registration is one transaction.",
    };
  }

  // 免费自检 ①：卡自己站得住吗（纯函数，零网络、零成本）。
  const contractDefects: OnboardingRejection[] = [];
  for (const model of validated.models) {
    for (const mode of model.modes) {
      const check = checkAdapterModeContract({ modelKey: model.modelKey, kind: model.kind } as Model, mode);
      if (!check.ok) {
        contractDefects.push({ path: `${model.modelKey}.${mode.taskKind}`, code: check.reason, message: check.error });
      }
    }
  }

  // 免费自检 ②：这把 key 上游认吗。**没有 key 就不问**——「还没问」不等于「问过了没问题」。
  const after = readCatalog();
  const vendorRow = after.vendors.find((vendor) => vendor.key === registration.vendorKey);
  const apiKey = decryptApiKeyRecord(after.apiKeysByVendor[registration.vendorKey]);
  let credential: { checked: boolean; ok?: boolean; reason?: string; error?: string } = { checked: false };
  if (vendorRow && apiKey) {
    const probe = await probeAdapterCredential({ vendor: vendorRow, apiKey });
    credential = probe.ok
      ? { checked: true, ok: true }
      : { checked: true, ok: false, reason: probe.reason, error: probe.error };
  }

  const stillUnverified = unverified(
    "model_produces_output",
    "asset_upload_works",
    ...(credential.ok ? [] : (["credential_accepted", "endpoint_reachable"] as const)),
  );
  return {
    ok: true,
    vendorKey: registration.vendorKey,
    changeId: changeIdFor(registration.vendorKey, "submit_declaration", args),
    state: {
      vendorKey: registration.vendorKey,
      vendorName: registration.vendorName,
      models: registration.models,
      mappings: registration.mappings,
      hasApiKey: registration.hasApiKey,
      boundOrigin: registration.boundOrigin,
      selfCheck: { contract: contractDefects.length === 0 ? "passed" : "defects", credential },
      ...(contractDefects.length > 0 ? { defects: contractDefects } : {}),
    },
    unverified: stillUnverified,
    changes: registration.models.map((model) => ({
      state: "S11.4" as const,
      summary: `Registered ${model.modelKey} (${model.taskKinds.join(", ")}), marked not tried yet.`,
    })),
    blastRadius: {
      ...noBlast(),
      modelsAppearing: registration.models.length,
      outboundRequests: credential.checked ? freeRequests(new URL(validated.provider.baseUrl).origin) : [],
    },
    nextAction: registration.hasApiKey
      ? {
        kind: "none",
        userSees: `${registration.models.length} model(s) are in Nomi's model pickers, marked "not tried yet". Prove one works with nomi_try_model before telling the user it is connected.`,
      }
      : {
        kind: "user_sees_key_page",
        userSees: `${registration.models.length} model(s) are registered, but ${registration.vendorName} has no key yet, so nothing can run. Either the user pastes it in Nomi (connect_provider opens that page) or, if they hand it to you, save it with action=set_key.`,
      },
  };
}
