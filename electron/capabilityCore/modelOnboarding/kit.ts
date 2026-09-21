/**
 * 接入套件（F1）：**一次调用，无任何前置**，把「写一份配置」需要的四样东西一起给出去。
 *
 * ── 为什么它必须无前置 ────────────────────────────────────────────────────────────
 * 2026-09-21 真机实测：四个模型一个都没走到「声明」那一步，因为声明卡的 schema 只在
 * `credentialStatus=ready` 之后才投影（`integrationSession.ts` 的 `compileRequest` 一路），
 * 而那要等一个人去 Nomi 窗口里粘完 key。于是 AI 在等待期间**一件事都做不了**。
 * 而这里发出去的三样——JSON Schema、撰写规范、样例卡——全是**进程常量**，零用户数据、
 * 零凭据、零网络。让它们等 key 从来没有换来任何安全，只换来了 0 个登记成功的模型。
 *
 * ── 为什么样例和 schema 一起发 ──────────────────────────────────────────────────
 * schema 说得清「哪些字段合法」，说不清「这一类供应商长什么样」。九家先例里没有一家做过
 * 「AI 直接写供应商适配器」（prior-art 报告），所以成功率只能靠「例子 + 校验 + 真实报错」
 * 三件顶上去——不是靠提示词写得更长。
 */
import { zodToJsonSchema } from "zod-to-json-schema";

import { adapterContractJsonSchema, ADAPTER_CONTRACT_INSTRUCTIONS } from "../../providerAdapter/agentCompileRequest";
import { adapterDraftSchema } from "../../providerAdapter/validator";
import { ONBOARDING_KIT_EXAMPLES } from "./kitExamples";

let cachedCardSchema: Record<string, unknown> | undefined;

/**
 * 整张卡的 JSON Schema（含 `provider` 块）。
 *
 * 和 `adapterContractJsonSchema()`（交件 schema，不含 `provider`）的区别是**谁填 provider**：
 * 设置页那条路上 provider 由会话从用户已确认的地址填，卡只能复述；这条路上连接可能还不存在，
 * 所以卡自己带着它，而「已经绑过 key 的连接不许被卡改地址」那条判据落在登记门上
 * （`catalog/declaredProviderRegistration.ts`），不落在 schema 上——schema 拦不住第二次提交。
 */
export function declarationCardJsonSchema(): Record<string, unknown> {
  // 与 `agentCompileRequest.ts` 同一处理：zod-to-json-schema 的公开签名在这种深度的 schema 上
  // 会把 tsc 推到 TS2589，转换本身是运行时正确的。
  const convert = zodToJsonSchema as unknown as (schema: unknown, options: Record<string, unknown>) => Record<string, unknown>;
  cachedCardSchema ||= convert(adapterDraftSchema, {
    name: "NomiProviderDeclarationCard",
    $refStrategy: "none",
    target: "jsonSchema7",
  });
  return cachedCardSchema;
}

export type OnboardingKit = {
  contractSchema: Record<string, unknown>;
  /** 交件 schema（不含 provider），给「往一条已存在的连接上补模型」那条路读。 */
  suppliedContractSchema: Record<string, unknown>;
  instructions: string;
  examples: ReadonlyArray<{ name: string; useWhen: string; card: unknown }>;
  howToSubmit: {
    action: string;
    note: string;
    credentials: string;
    tryOut: string;
  };
};

export function buildOnboardingKit(): OnboardingKit {
  return {
    contractSchema: declarationCardJsonSchema(),
    suppliedContractSchema: adapterContractJsonSchema(),
    instructions: ADAPTER_CONTRACT_INSTRUCTIONS,
    examples: ONBOARDING_KIT_EXAMPLES.map((example) => ({
      name: example.name,
      useWhen: example.useWhen,
      card: example.card,
    })),
    howToSubmit: {
      action:
        'Send the whole card in one call: nomi_model_setup {"action":"submit_declaration","declaration":"<the card as JSON text>"}. There is no handle to obtain first and no stage to be in.',
      note:
        "A rejected card comes back with the field path, the legal values and the documentation URL you declared for it. Fix that field and send the whole card again; submitting is a full overwrite, never a patch.",
      credentials:
        "You do not need the API key to write or submit the card. The key can be saved at any time, either by the user in Nomi's own credential page (nomi_model_setup action=connect_provider opens it) or, if the user hands it to you, with nomi_model_setup action=set_key. Never ask for a key in chat that the user has not offered, never print it, never write it to a file.",
      tryOut:
        'Once a key is saved, prove it works: nomi_model_setup {"action":"try_model","vendorKey":"…","modelKey":"…","prompt":"…"} runs one real generation and hands the provider\'s own response back to you (with secrets removed). Do not tell the user the model is connected until that call has produced an artifact.',
    },
  };
}
