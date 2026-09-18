// 接模型的五个动词（方案 §4.2）。**只投对外 profile**。
//
// 为什么不进内部面：内部 lane 跑在 headless 宿主里，它既没有贴 key 页可开，也没有一个人在旁边
// 把密钥粘进去——密钥永远由用户在 Nomi 自己的安全页输入。内部面上「接模型」这件事的形状是
// `start_model_setup`（把设置页打开，让用户自己接），那一条仍然在，且是它自己的动词。
// 这里这五条是**对外宿主**（Claude Code / Codex）驱动的那条路：它能读文档、能交卡，但它交的
// 一切都是**未签名的数据**——所以地址与鉴权放法一个字都不在入参里（§6.1）。
import { z } from "zod";

import type { VerbDeclaration } from "../verbDeclaration";

const setupId = z.string().trim().min(1).max(200)
  .describe("The setup handle returned by connect_provider; nomi_read target=setup reports its state.");

/**
 * 同一个对外工具里同名字段必须**同形**（`projectMcpTool` 的 mergeFieldSchema 装配期抛）——
 * 那条规则不是审美：两个动词对同一个字段各写一份描述，模型读到的就是两种说法。
 * 必填与否不在这里表达（由「所有别名都必填才全局必填」派生），所以一份定义两处用。
 */
const vendorKey = z.string().trim().min(1).max(160)
  .describe("Connection id, exactly as nomi_read target=models returned it.");

export function onboardingVerbs(): VerbDeclaration[] {
  const connectProvider: VerbDeclaration = {
    name: "connect_model_provider",
    profiles: ["mcp"],
    profileReason: "headlessHost",
    contractId: "model.onboarding.setup",
    effect: "reversible_local",
    nextAction: "user_sees_panel",
    aliasBoundInput: { action: "connect_provider" },
    describe: {
      does: "Open Nomi's credential page for one provider so the user can paste its key, and start a setup.",
      useWhen: "The user asks to connect a provider or a model that Nomi does not have yet.",
      notWhen: "It never accepts, asks for or stores an API key, and it cannot decide where a key is sent: the address is confirmed by the user on that page. Once the key is saved, describe the provider's API with submit_model_declaration. To hide or show models that are already connected use show_provider_models; to delete one use remove_model_provider.",
      params: "name is the provider's display name. docs is the API documentation: either the text itself or one http(s) URL per line. suggestedBaseUrl is only pre-filled on the page for the user to confirm. Pass vendorKey instead of name to adjust a connection that already exists; only its name, its proxy switch and reissuing the key can change there.",
    },
    schema: z.object({
      name: z.string().trim().min(1).max(240).optional().describe("Provider display name, required when connecting a new one."),
      vendorKey: vendorKey.optional(),
      docs: z.string().max(65_536).optional().describe("API documentation: the text itself, or one http(s) URL per line."),
      suggestedBaseUrl: z.string().trim().min(1).max(2_000).optional().describe("Address suggestion. It is only pre-filled on the credential page; the user confirms it by saving, and Nomi binds the key to it."),
      suggestedAuthNote: z.string().trim().min(1).max(400).optional().describe("One sentence on how this provider wants the key sent, shown next to the address."),
      sourceUrl: z.string().trim().min(1).max(2_048).optional().describe("Documentation page the suggestion was read from; shown to the user."),
      proxyEnabled: z.boolean().optional().describe("Turn this connection's already-saved proxy on or off. The proxy URL itself is never an argument."),
      reissueKey: z.boolean().optional().describe("Reopen the credential page for an existing connection so the user can paste a new key."),
    }).strict(),
    examples: [
      { when: "Connect a provider the user has an account with:", arguments: { name: "Higgsfield", docs: "https://docs.higgsfield.ai/api-reference", suggestedBaseUrl: "https://platform.higgsfield.ai" } },
      { when: "The user says the key stopped working:", arguments: { vendorKey: "higgsfield", reissueKey: true } },
    ],
    // 通道③：进外部宿主读到的那段说明。一条 schema-valid 的调用示例写在这里，而不是另起一份
    // 文案（`check:model-schema` 的 missing-example 认的就是描述里那段 JSON）。
    promptGuidelines: [
      'A first call looks like {"action": "connect_provider", "name": "Higgsfield", "docs": "https://docs.higgsfield.ai/api-reference", "suggestedBaseUrl": "https://platform.higgsfield.ai"}, then hand the card over with {"action": "submit_declaration", "setupId": "the id it returned", "declaration": "the card as JSON text"}.',
      "Nothing on this tool spends the user's credit, and nothing here can decide where a saved key is sent: that address is confirmed by the user on Nomi's own page.",
    ],
  };

  const submitDeclaration: VerbDeclaration = {
    name: "submit_model_declaration",
    profiles: ["mcp"],
    profileReason: "headlessHost",
    contractId: "model.onboarding.setup",
    effect: "reversible_local",
    nextAction: "none",
    aliasBoundInput: { action: "submit_declaration" },
    describe: {
      does: "Hand Nomi a declaration card describing this provider's models, and register the ones that pass.",
      useWhen: "The key is saved and you have read the provider's API documentation.",
      notWhen: "It never proves a model can produce anything: the reply always keeps whether this model can actually produce something in its unverified list until the user generates once. Send it only after connect_model_provider reports the key is saved. It does not delete anything; use remove_model_provider for that.",
      params: "setupId comes from connect_model_provider. declaration is the card as JSON text; nomi_read target=setup returns the exact schema it must match, and every rejected field comes back with the path and the documentation URL you declared for it.",
    },
    schema: z.object({
      setupId,
      declaration: z.string().min(2).max(512 * 1024).describe("The declaration card as JSON text. Its shape is the contractSchema returned by nomi_read target=setup."),
    }).strict(),
    examples: [
      { when: "Describe one image model after reading the docs:", arguments: { setupId: "setup-1", declaration: '{"sources":[],"assetIngestion":{"strategy":"none","sourceUrl":"https://docs.example/api"},"models":[]}' } },
    ],
  };

  const showModels: VerbDeclaration = {
    name: "show_provider_models",
    profiles: ["mcp"],
    profileReason: "headlessHost",
    contractId: "model.onboarding.setup",
    effect: "reversible_local",
    nextAction: "none",
    aliasBoundInput: { action: "show_models" },
    describe: {
      does: "Show or hide models of a connected provider in Nomi's model pickers.",
      useWhen: "The user asks to tidy up the model list, or to bring a hidden model back.",
      notWhen: "Hiding is not deleting and frees nothing: to remove a model or a whole connection use remove_model_provider. To add new models use submit_model_declaration.",
      params: "vendorKey and modelKeys come from nomi_read target=models. visible=false hides them.",
    },
    schema: z.object({
      vendorKey,
      modelKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(200).describe("Exact model ids from nomi_read target=models."),
      visible: z.boolean().describe("true shows them in the pickers, false hides them."),
    }).strict(),
    examples: [
      { when: "Hide two models the user never picks:", arguments: { vendorKey: "apimart", modelKeys: ["imagen-4", "imagen-4-fast"], visible: false } },
    ],
  };

  const cancelSetup: VerbDeclaration = {
    name: "cancel_model_setup",
    profiles: ["mcp"],
    profileReason: "headlessHost",
    contractId: "model.onboarding.setup",
    effect: "reversible_local",
    nextAction: "none",
    aliasBoundInput: { action: "cancel" },
    describe: {
      does: "Abandon an in-flight model setup.",
      useWhen: "The user changes their mind before the declaration is accepted.",
      notWhen: "It leaves an already-saved key and an already-connected provider untouched; to delete those use remove_model_provider. To carry on instead, use submit_model_declaration.",
      params: "setupId comes from connect_model_provider.",
    },
    schema: z.object({ setupId }).strict(),
    examples: [{ when: "Drop the setup:", arguments: { setupId: "setup-1" } }],
  };

  const removeProvider: VerbDeclaration = {
    name: "remove_model_provider",
    profiles: ["mcp"],
    profileReason: "headlessHost",
    contractId: "model.onboarding.remove",
    effect: "irreversible",
    nextAction: "user_sees_confirm_card",
    describe: {
      does: "Permanently delete models, or a whole provider connection including its saved key.",
      useWhen: "The user asks to remove a provider or models they no longer want.",
      notWhen: "This cannot be undone and it is not how you tidy a crowded picker: use show_provider_models with visible=false to hide instead. It does not connect anything; that is connect_model_provider.",
      params: "vendorKey and modelKeys come from nomi_read target=models. Leave modelKeys out to delete the whole connection. ifUnchanged is the fingerprint that same read returned, so a stale plan cannot delete something else.",
    },
    schema: z.object({
      vendorKey,
      modelKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(200).optional().describe("Exact model ids to delete. Omit to delete the whole connection and its saved key."),
      ifUnchanged: z.string().trim().min(1).max(200).describe("Fingerprint from the nomi_read that listed these; the delete is refused if anything changed since."),
    }).strict(),
    examples: [
      { when: "Delete a connection the user is done with:", arguments: { vendorKey: "old-relay", ifUnchanged: "models-7f3a" } },
    ],
    promptGuidelines: [
      'Read first, then delete: {"vendorKey": "old-relay", "ifUnchanged": "the fingerprint that read returned"}. Leaving modelKeys out deletes the whole connection, including the key the user saved, and Nomi will not seed it back.',
      "There is no undo. If the user only wants a shorter list, hide the models instead.",
    ],
  };

  return [connectProvider, submitDeclaration, showModels, cancelSetup, removeProvider];
}
