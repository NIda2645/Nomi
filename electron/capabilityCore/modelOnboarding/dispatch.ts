/**
 * 接模型工具面的**执行层**（方案 §4.2）。
 *
 * ── 它是投影，不是第二个状态机 ────────────────────────────────────────────────────────
 * 底座仍是 `IntegrationSessionService`（owner / revision / 阶段词表 / 看门狗 / 迁移都在那），
 * `setupId` 就是它的 session id。这里只做三件事：
 *   ① 把「一种后果一跳」的动词映射到底座已有的那几步（begin+open_credentials / propose+start / cancel）；
 *   ② `expectedRevision` **不进模型入参**——它是会话指纹，由本层现读现填（09-10 实测：模型每猜错一次
 *      就烧掉一次完整往返，22 次失败里 9 次是这一类）；
 *   ③ 把结果整理成 §4.3 的信封，其中 `unverified` 永远留着 `model_produces_output`。
 *
 * ── 地址与鉴权放法一个字都不在入参里 ──────────────────────────────────────────────────
 * `suggestedBaseUrl` 只用于**新建**连接时预填那一页，用户按下保存才把 key 绑到那个 origin
 * （§6.1，`catalog/credentialBinding.ts`）。对**已存在**的连接，这一层拒绝任何地址建议——
 * 改地址只有一条路：回那一页重新保存一次密钥。
 */
import {
  deleteModelCatalogModels,
  deleteModelCatalogVendor,
  listModelCatalogVendors,
  readCatalog,
  upsertModelCatalogModel,
  upsertModelCatalogVendor,
  mutateCatalog,
} from "../../catalog/catalogStore";
import { readCredentialBinding } from "../../catalog/credentialBinding";
import { isJsonRecord } from "../../jsonUtils";
import type { CapabilityOriginHost } from "../security";
import { getIntegrationSessionService, type IntegrationSessionService } from "../../integrationCertification/integrationSession";
import { withCredentialElicitationTicket } from "../../integrationCertification/credentialElicitation";
import { catalogFingerprint, changeIdFor } from "./fingerprint";
import {
  freeRequests,
  noBlast,
  unverified,
  type OnboardingFailure,
  type OnboardingRejection,
  type OnboardingResult,
} from "./envelope";

export type OnboardingDispatchDeps = {
  sessions: IntegrationSessionService;
  owner: CapabilityOriginHost;
  /** 打开 Nomi 的贴 key 页（app 没开时排队等下次打开，与旧 open_credentials 同一条路）。 */
  openCredentialsInNomi?: (input: { sessionId: string; vendorName: string }) => Promise<{ opened: boolean } | void> | { opened: boolean } | void;
  /** 铸一次性 MCP URL elicitation 票（与旧 open_credentials 同一处）。 */
  withCredentialElicitationTicket: (projection: Record<string, unknown>) => Record<string, unknown>;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** 目录里现在有哪几行——`ifUnchanged` 与 `nomi_read target=models` 读的是同一份。 */
export function currentCatalogFingerprint(): string {
  const catalog = readCatalog();
  return catalogFingerprint(catalog.models.map((model) => ({ vendor: model.vendorKey, modelKey: model.modelKey })));
}

// ── connect_provider ────────────────────────────────────────────────────────────────

async function connectProvider(
  deps: OnboardingDispatchDeps,
  args: Record<string, unknown>,
): Promise<OnboardingResult | OnboardingFailure> {
  const vendorKey = text(args.vendorKey);
  const suggestedBaseUrl = text(args.suggestedBaseUrl);
  // 查一次，两处用（改名/代理开关那一段，和下面重开贴 key 页那一跳）。
  const vendor = vendorKey ? listModelCatalogVendors().find((row) => row.key === vendorKey) : undefined;

  if (vendorKey) {
    if (!vendor) {
      return {
        ok: false, code: "not_found",
        message: `No connection called ${vendorKey}. Read nomi_read target=models for the ids that exist.`,
        nextAction: "Call nomi_read target=models and use one of the vendor ids it returns.",
      };
    }
    // 地址与鉴权放法在这条路上是**只读**的：改它们等于让一段对话文本决定用户的密钥发往哪里。
    if (suggestedBaseUrl) {
      const binding = readCredentialBinding(vendor);
      return {
        ok: false, code: "credential_origin_mismatch",
        message: `This connection already holds a key${binding?.origin ? `, bound to ${binding.origin}` : ""}. Where a saved key is sent is decided by the user on Nomi's credential page, not by an argument.`,
        nextAction: "Call connect_provider again with reissueKey=true (and no suggestedBaseUrl): Nomi reopens that page with the address editable, and the user's save rebinds the key.",
      };
    }
    const changes: OnboardingResult["changes"] = [];
    const name = text(args.name);
    if (name && name !== vendor.name) {
      upsertModelCatalogVendor({ key: vendorKey, name });
      changes.push({ state: "S11.1", summary: `Renamed the connection to ${name}.` });
    }
    if (typeof args.proxyEnabled === "boolean") {
      if (args.proxyEnabled && !vendor.network?.proxyUrl) {
        return {
          ok: false, code: "needs_input",
          message: "This connection has no proxy saved, so there is nothing to switch on.",
          needs: ["a proxy URL saved by the user in Nomi's network settings"],
          nextAction: "Ask the user to save a proxy for this connection in Nomi's model settings first.",
        };
      }
      upsertModelCatalogVendor({ key: vendorKey, network: { proxyEnabled: args.proxyEnabled } });
      changes.push({ state: "S11.1", summary: `Turned this connection's proxy ${args.proxyEnabled ? "on" : "off"}.` });
    }
    if (args.reissueKey !== true) {
      return {
        ok: true, vendorKey, state: { vendorKey, name: name || vendor.name },
        unverified: unverified("model_produces_output"),
        changes, blastRadius: noBlast(),
        nextAction: { kind: "none", userSees: "The connection is updated. Nothing was sent anywhere." },
      };
    }
  }

  if (!vendorKey && !text(args.name)) {
    return {
      ok: false, code: "needs_input",
      message: "connect_provider needs a name for a new connection, or a vendorKey to adjust one that exists.",
      needs: ["name"],
      nextAction: "Send name (the provider's display name), plus docs and suggestedBaseUrl when you have them.",
    };
  }
  if (!vendorKey && !suggestedBaseUrl) {
    return {
      ok: false, code: "needs_input",
      message: "Nomi needs an address to pre-fill on the credential page before the user can confirm it.",
      needs: ["suggestedBaseUrl"],
      nextAction: "Read the provider's documentation for its API base URL and send it as suggestedBaseUrl. The user confirms it by saving; you never decide it.",
    };
  }

  const opened = vendorKey
    ? reopenForVendor(deps, vendorKey, vendor)
    : deps.sessions.begin({
      kind: "http-api-provider",
      name: text(args.name),
      baseUrl: suggestedBaseUrl,
      ...(text(args.docs) ? { docs: text(args.docs) } : {}),
    }, deps.owner);
  if ("ok" in opened) return opened;

  const credentials = deps.sessions.openCredentials(opened.id, opened.revision, deps.owner);
  let ui: { opened: boolean } | void;
  try {
    ui = await deps.openCredentialsInNomi?.({ sessionId: credentials.id, vendorName: credentials.config.name });
  } catch {
    // 排队的交接单会在 Nomi 下次打开时重放；窗口消失不该让 MCP 契约不可用。
    ui = { opened: false };
  }
  const ticketed = deps.withCredentialElicitationTicket({ ...credentials, credentialUiOpened: ui?.opened === true });
  return {
    ok: true,
    setupId: credentials.id,
    changeId: changeIdFor(credentials.id, "connect_provider", args),
    state: ticketed,
    unverified: unverified("endpoint_reachable", "credential_accepted", "declaration_valid", "model_produces_output"),
    changes: [{ state: "S11.1", summary: `Opened Nomi's credential page for ${credentials.config.name}.` }],
    blastRadius: noBlast(),
    nextAction: {
      kind: "user_sees_key_page",
      userSees: `Nomi is showing the address this key will be bound to${suggestedBaseUrl ? ` (${suggestedBaseUrl})` : ""} with a box to paste the key. Saving is the user's confirmation of that address.`,
      waitWith: "nomi_read target=setup waitMs",
      ...(typeof (ticketed as { credentialUrl?: unknown }).credentialUrl === "string"
        ? { url: (ticketed as { credentialUrl: string }).credentialUrl }
        : {}),
    },
  };
}

/**
 * 已存在的连接要重新贴 key：地址**沿用它自己那一行**，不由这一跳的入参决定。
 *
 * 这条路刻意与「新建一家」分开命名（而不是合成一次 `begin`）：两者的地址来源不同——
 * 一个来自已存的 vendor 行，一个来自 Agent 的建议且必须由用户在那一页上确认。把它们写成
 * 同一个表达式，正好抹掉本刀要守的那条区别（§6.1）。vendor 由调用方传进来，不重查一次。
 */
function reopenForVendor(
  deps: OnboardingDispatchDeps,
  vendorKey: string,
  vendor: { name?: string; baseUrlHint?: string | null } | undefined,
): OnboardingFailure | ReturnType<IntegrationSessionService["begin"]> {
  const baseUrl = text(vendor?.baseUrlHint);
  if (!baseUrl) {
    return {
      ok: false, code: "needs_input",
      message: `Connection ${vendorKey} has no address on file, so Nomi cannot reopen its credential page.`,
      needs: ["the user to add this connection in Nomi's model settings"],
      nextAction: "Ask the user to open Nomi's model settings and add the address there.",
    };
  }
  return deps.sessions.begin({
    kind: "http-api-provider",
    name: vendor?.name || vendorKey,
    baseUrl,
  }, deps.owner);
}

// ── submit_declaration ──────────────────────────────────────────────────────────────

/** 校验器抛的一句话 → 卡上的位置 + 一个码。**不猜**：认不出位置就如实说「整张卡」。 */
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

/**
 * 「这家需要的东西，声明卡表达不了」——**唯一**的出口是人写调用脚本（方案 §5 末段）。
 *
 * 四类表达不了的：请求签名 / HMAC / OAuth 换 token；非 HTTP（gRPC / WebSocket / 流式媒体）；
 * SDK-only；超出「（上传初始化 →）create → query → result」的多请求编排；自定义编码。
 *
 * `nextAction` **不许**指向 OpenAI 兼容模板：那正是 09-11 那条「静默落回模板」在人话层的复发——
 * 把「这条路本来就不通」说成「用那个模板试试」，用户会一直试，而每一次都必然在同一堵墙上。
 * `noGenericContract.test.ts` 逐字核这一条。
 */
export function noGenericContractFailure(what: string): OnboardingFailure {
  return {
    ok: false,
    code: "no_generic_contract",
    message: `${what} needs something a declaration card cannot express: a request signature, a non-HTTP transport, an SDK, a custom encoding, or more request steps than (upload init ->) create -> query -> result.`,
    nextAction: "This provider is not reachable by declaring it. In Nomi, open Settings > that model > Call script and write the call by hand; that path is exactly for this case.",
  };
}

/** 卡**自己声明**的出处（不是我们猜的那一条）。 */
function cardSourceUrl(card: unknown): string | undefined {
  if (!isJsonRecord(card)) return undefined;
  const sources = card.sources;
  if (!Array.isArray(sources) || sources.length === 0) return undefined;
  const first = sources[0];
  return isJsonRecord(first) && typeof first.url === "string" ? first.url : undefined;
}

async function submitDeclaration(
  deps: OnboardingDispatchDeps,
  args: Record<string, unknown>,
): Promise<OnboardingResult | OnboardingFailure> {
  const setupId = text(args.setupId);
  let card: unknown;
  try {
    card = JSON.parse(String(args.declaration ?? ""));
  } catch (error) {
    return {
      ok: false, code: "declaration_rejected",
      message: "The declaration is not valid JSON.",
      rejections: [{ path: "declaration", code: "schema", message: error instanceof Error ? error.message.slice(0, 300) : "invalid JSON" }],
      nextAction: "Send the card again as one JSON object; nomi_read target=setup returns the exact schema it must match.",
    };
  }
  const models = isJsonRecord(card) && Array.isArray(card.models) ? card.models : [];
  if (models.length === 0) {
    return {
      ok: false, code: "declaration_rejected",
      message: "The declaration lists no models.",
      rejections: [{ path: "models", code: "schema", message: "models must contain at least one model" }],
      nextAction: "Describe at least one model, with its modelKey, kind and one mode.",
    };
  }
  const candidates = models.map((model) => ({
    modelKey: isJsonRecord(model) ? String(model.modelKey ?? "") : "",
    kind: isJsonRecord(model) ? String(model.kind ?? "") : "",
  }));

  let projection;
  try {
    const before = deps.sessions.get(setupId, deps.owner) as { revision: number };
    projection = await deps.sessions.propose(setupId, before.revision, deps.owner, {
      candidates,
      selections: candidates.map((candidate) => ({ modelKey: candidate.modelKey })),
      adapterDraft: String(args.declaration ?? ""),
    });
  } catch (error) {
    return {
      ok: false, code: "declaration_rejected",
      message: "Nomi rejected the declaration.",
      rejections: rejectionsFromError(error, card),
      nextAction: "Fix the named field against the documentation URL you declared for it, then call submit_declaration again with the same setupId.",
    };
  }

  if (projection.compileRequest) {
    // 自建 / 内网端点：模板是**你显式选**的一条出路，不是我们替你套的兜底（§ Q3）。
    return {
      ok: false, code: "needs_input",
      message: "Nomi cannot read this endpoint's public documentation, so it will not guess a request shape for it.",
      needs: ["a declaration card for this endpoint"],
      nextAction: projection.compileRequest.suggestedTemplate
        ? `If this is an OpenAI-compatible relay, say so explicitly by declaring the built-in template ${projection.compileRequest.suggestedTemplate} in the card. Otherwise describe the real request shape.`
        : "Describe the real request shape in the card.",
    };
  }

  let settled;
  try {
    settled = await deps.sessions.start(setupId, projection.revision, deps.owner, changeIdFor(setupId, "submit_declaration", args));
  } catch (error) {
    // 「这个 kind 在通用协议上根本没有端点」与「这张卡写错了」是两种处境，给的下一步相反：
    // 前者改卡一万次都没用，出口是人写脚本（`serviceFallback` 的 no_generic_contract 一路传到这里）。
    if (/no_generic_contract|no generic contract/i.test(error instanceof Error ? error.message : String(error))) {
      return noGenericContractFailure(candidates.map((candidate) => candidate.modelKey).join(", "));
    }
    return {
      ok: false, code: "provider_failed",
      message: "The free self-check did not pass.",
      rejections: rejectionsFromError(error, card),
      nextAction: "Read nomi_read target=setup for the self-check evidence, fix the card and submit it again.",
    };
  }

  const vendors = listModelCatalogVendors();
  const origin = text(vendors.find((row) => row.name === (settled as { config?: { name?: string } }).config?.name)?.baseUrlHint);
  return {
    ok: true,
    setupId,
    changeId: changeIdFor(setupId, "submit_declaration", args),
    state: settled,
    // 自检过了也**永远**留着 model_produces_output：它只有一次真实生成能消掉。
    unverified: unverified("model_produces_output", "asset_upload_works"),
    changes: candidates.map((candidate) => ({ state: "S11.4" as const, summary: `Registered ${candidate.modelKey}, marked not tried yet.` })),
    blastRadius: { ...noBlast(), modelsAppearing: candidates.length, outboundRequests: freeRequests(origin) },
    nextAction: {
      kind: "none",
      userSees: `${candidates.length} model(s) now appear in Nomi's model pickers, marked "not tried yet". The first real generation is the try-out.`,
    },
  };
}

// ── show_models / cancel ────────────────────────────────────────────────────────────

function showModels(args: Record<string, unknown>): OnboardingResult | OnboardingFailure {
  const vendorKey = text(args.vendorKey);
  const modelKeys = Array.isArray(args.modelKeys) ? args.modelKeys.map((key) => text(key)).filter(Boolean) : [];
  const visible = args.visible === true;
  const catalog = readCatalog();
  const missing = modelKeys.filter((modelKey) => !catalog.models.some((model) => model.vendorKey === vendorKey && model.modelKey === modelKey));
  if (missing.length > 0) {
    return {
      ok: false, code: "not_found",
      message: `These models are not on connection ${vendorKey}: ${missing.join(", ")}.`,
      nextAction: "Call nomi_read target=models and use the exact vendor and model ids it returns.",
    };
  }
  for (const modelKey of modelKeys) upsertModelCatalogModel({ vendorKey, modelKey, enabled: visible });
  return {
    ok: true, vendorKey,
    state: { vendorKey, modelKeys, visible },
    unverified: unverified("model_produces_output"),
    changes: [{ state: "S11.6", summary: `${visible ? "Showed" : "Hid"} ${modelKeys.length} model(s).` }],
    blastRadius: {
      ...noBlast(),
      modelsAppearing: visible ? modelKeys.length : 0,
      modelsDisappearing: visible ? 0 : modelKeys.length,
    },
    nextAction: {
      kind: "none",
      userSees: visible
        ? `${modelKeys.length} model(s) are back in the pickers.`
        : `${modelKeys.length} model(s) are hidden from the pickers. Nothing was deleted; they can be shown again.`,
    },
  };
}

function cancelSetup(deps: OnboardingDispatchDeps, args: Record<string, unknown>): OnboardingResult | OnboardingFailure {
  const setupId = text(args.setupId);
  const before = deps.sessions.get(setupId, deps.owner) as { revision: number };
  const cancelled = deps.sessions.cancel(setupId, before.revision, deps.owner);
  return {
    ok: true, setupId, state: cancelled,
    unverified: unverified("model_produces_output"),
    changes: [{ state: "S11.0", summary: "Abandoned this setup." }],
    blastRadius: noBlast(),
    nextAction: { kind: "none", userSees: "The setup is abandoned. An already-saved key and an already-connected provider are untouched." },
  };
}

// ── remove ──────────────────────────────────────────────────────────────────────────

export function removeProvider(args: Record<string, unknown>): OnboardingResult | OnboardingFailure {
  const vendorKey = text(args.vendorKey);
  const modelKeys = Array.isArray(args.modelKeys) ? args.modelKeys.map((key) => text(key)).filter(Boolean) : [];
  const expected = text(args.ifUnchanged);
  const actual = currentCatalogFingerprint();
  if (expected !== actual) {
    return {
      ok: false, code: "stale_fingerprint",
      message: `The model list changed since you read it (you had ${expected}, it is now ${actual}). Nothing was deleted.`,
      nextAction: "Call nomi_read target=models again, check the rows are still the ones you meant, and retry with the fingerprint it returns.",
    };
  }
  const catalog = readCatalog();
  if (!catalog.vendors.some((vendor) => vendor.key === vendorKey)) {
    return {
      ok: false, code: "not_found",
      message: `No connection called ${vendorKey}.`,
      nextAction: "Call nomi_read target=models for the ids that exist.",
    };
  }
  if (modelKeys.length > 0) {
    deleteModelCatalogModels(modelKeys.map((modelKey) => ({ vendorKey, modelKey })));
    return {
      ok: true, vendorKey, state: { vendorKey, deletedModelKeys: modelKeys },
      unverified: [],
      changes: [{ state: "S11.6", summary: `Deleted ${modelKeys.length} model(s) from ${vendorKey}.` }],
      blastRadius: { ...noBlast(), modelsDisappearing: modelKeys.length, recordsDeleted: modelKeys.length },
      nextAction: { kind: "user_sees_confirm_card", userSees: `${modelKeys.length} model(s) are gone for good. The connection and its key are untouched.` },
    };
  }
  // 整家删：**用户显式删的家不许下次启动再种回来**（Q12）。升级/重装不走这条路，所以它只对
  // 「他自己按的那一下」生效。
  const builtinModels = catalog.models.filter((model) =>
    model.vendorKey === vendorKey && isJsonRecord(model.meta) && typeof model.meta.catalogLifecycle === "string");
  const deletedCount = catalog.models.filter((model) => model.vendorKey === vendorKey).length;
  if (builtinModels.length > 0) {
    mutateCatalog((_tx, state) => {
      const mutable = state as unknown as { suppressedBuiltinModels?: Array<{ vendorKey: string; modelKey: string }> };
      const suppressed = [...(mutable.suppressedBuiltinModels || [])];
      for (const model of builtinModels) {
        if (!suppressed.some((row) => row.vendorKey === vendorKey && row.modelKey === model.modelKey)) {
          suppressed.push({ vendorKey, modelKey: model.modelKey });
        }
      }
      mutable.suppressedBuiltinModels = suppressed;
    });
  }
  deleteModelCatalogVendor(vendorKey);
  return {
    ok: true, vendorKey, state: { vendorKey, deleted: true },
    unverified: [],
    changes: [{ state: "S11.6", summary: `Deleted the ${vendorKey} connection, its saved key and ${deletedCount} model(s).` }],
    blastRadius: { ...noBlast(), modelsDisappearing: deletedCount, recordsDeleted: deletedCount + 1 },
    nextAction: {
      kind: "user_sees_confirm_card",
      userSees: `${vendorKey} is gone for good, including the saved key. Nomi will not seed it back on the next start.`,
    },
  };
}

// ── 入口 ────────────────────────────────────────────────────────────────────────────

export async function dispatchModelSetup(
  deps: OnboardingDispatchDeps,
  params: Record<string, unknown>,
): Promise<OnboardingResult | OnboardingFailure> {
  switch (text(params.action)) {
    case "connect_provider": return connectProvider(deps, params);
    case "submit_declaration": return submitDeclaration(deps, params);
    case "show_models": return showModels(params);
    case "cancel": return cancelSetup(deps, params);
    default:
      return {
        ok: false, code: "invalid_args",
        message: `nomi_model_setup needs one of these actions: connect_provider, submit_declaration, show_models, cancel.`,
        nextAction: "Send action with one of those four values.",
      };
  }
}

/**
 * dispatcher 的那两格（`model.onboarding.*`）。**依赖装配也住这里**，不住 `dispatcher.ts`：
 * 那份是已知巨壳（R9，上限 800 行），而这两格要的东西（会话服务、贴 key 页、一次性票）
 * 与它的其它 case 一个都不共享——装配写在那边只是让巨壳再长六行。
 */
export function dispatchModelOnboarding(
  method: string,
  params: Record<string, unknown>,
  ctx: {
    owner: CapabilityOriginHost;
    sessions?: IntegrationSessionService;
    openCredentialsInNomi?: OnboardingDispatchDeps["openCredentialsInNomi"];
  },
): Promise<OnboardingResult | OnboardingFailure> | OnboardingResult | OnboardingFailure {
  if (method === "model.onboarding.remove") return removeProvider(params);
  return dispatchModelSetup({
    sessions: ctx.sessions || getIntegrationSessionService(),
    owner: ctx.owner,
    ...(ctx.openCredentialsInNomi ? { openCredentialsInNomi: ctx.openCredentialsInNomi } : {}),
    withCredentialElicitationTicket: (projection) => withCredentialElicitationTicket(projection as never) as Record<string, unknown>,
  }, params);
}
