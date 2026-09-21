// 「模型说明书」的**唯一投影**：薄名单一档、单模型详情一档，两个模型面共用这一份。
//
// 为什么要它（2026-09-21 用户拍板：「MCP 不能重造一套，而是复用」「分级披露，里外都要做」）：
// 在这之前，应用内 Agent 的 `list_models` 返回完整 `AgentModelEntry`（modes/params/slots），
// 而对外 MCP 面的 `nomi_read{target:"models"}` 只有 vendor/modelKey/kind/label —— **没有参数名**。
// 验收实测：外部面 8 个 run **0 个**走到建草稿，模型拿不到参数名时连计划都提不出来。
// 同一件事，两个入口差了一个数量级。
//
// 分级的形状不是自创：MCP 2026-07-28 规范本身**没有**「工具结果内部再分级」的机制
// （https://modelcontextprotocol.io/specification/2026-07-28/server/tools ，2026-09-21 读全文），
// 分级披露是**规范之上的设计模式**——Solo.io 的 agentgateway 把上游工具表换成
// `get_tool` / `invoke_tool` 两个元工具「so clients see only a lightweight index」
// （https://www.solo.io/blog/mcp-progressive-disclosure ，同日读全文）。
// 本仓早有同形状的先例：`skills.list`（元数据，不含正文）/ `skills.read`（正文），
// `dispatcher.ts` 那行注释原话就是「渐进披露，不含正文」。模型目录照抄它，不发明第三种。
//
// 为什么薄的那一档必须真薄：108 个模型的完整说明书是十万字量级，塞进每一回合就是把
// 上下文烧光、把工具写对率拖垮。薄名单只留**选型需要的最少字段**，选定之后再查那一个。
import type { AgentModelEntry } from "./availableModels";

/** 这个模型此刻能不能用——与 Nomi 自己界面里的下拉读的是同一个答案。 */
export type ModelAvailabilityFacts = {
  /** ok / missing / locked / needs_resave。 */
  keyStatus: string;
  usable: boolean;
  /** 一句人话：可用就报可用，不可用各报缺口 + 该干什么。 */
  statusReason: string;
};

/**
 * 薄名单的一行：**只够选型**。
 * 没有 params、没有 slots、没有每个 mode 的说明——那些在详情那一档。
 */
export type ModelSpecRow = Partial<ModelAvailabilityFacts> & {
  modelId: string;
  vendor: string | null;
  label: string;
  kind: AgentModelEntry["kind"];
  /** 有哪些模式（只给 id，够模型判断「这个模型有没有图生视频」）。 */
  modeIds: string[];
  /** 有哪些变体（只给 id）。不投就是「可被拒、不可发现」。 */
  variantIds?: string[];
  /** 能力位：这个模型**任一模式**吃不吃图/视频/音频参考。连边与选型都靠它先筛一轮。 */
  accepts: { image: boolean; video: boolean; audio: boolean; multiImage: boolean };
};

/** 单模型详情：薄名单那一行 + 全部模式、参数、参考槽、变体。 */
export type ModelSpecDetail = ModelSpecRow & {
  archetypeId?: string;
  modelAlias: string | null;
  defaultModeId: string;
  defaultVariantId?: string;
  modes: AgentModelEntry["modes"];
  variants?: AgentModelEntry["variants"];
};

const IMAGE_SLOTS = new Set(["image_ref", "first_frame", "last_frame"]);

/** 这个模型任一模式吃哪些参考——从档案声明的槽 derive，不另立一份判据。 */
function acceptsOf(entry: AgentModelEntry): ModelSpecRow["accepts"] {
  const slots = entry.modes.flatMap((mode) => mode.slots);
  const kinds = new Set(slots.map((slot) => slot.kind));
  return {
    image: [...kinds].some((kind) => IMAGE_SLOTS.has(kind)),
    video: kinds.has("video_ref") || kinds.has("source_video"),
    audio: kinds.has("audio_ref"),
    // 能不能一次吃多张图：看声明的槽容量，不另立判据。
    multiImage: slots.some((slot) => IMAGE_SLOTS.has(slot.kind) && (slot.max ?? 1) > 1),
  };
}

/**
 * `availability` 可缺省：应用内那一面的清单是渲染层按「此刻可用」筛过再推上来的，
 * 少数装配路径（测试夹具、还没接目录的宿主）拿不到那三样。**缺就不写**，不编一个 `usable: true`
 * ——「不知道」和「可用」是两件事。生产两面都由目录注入，故两面都有。
 */
export function modelSpecRow(entry: AgentModelEntry, availability?: ModelAvailabilityFacts): ModelSpecRow {
  return {
    modelId: entry.modelId,
    vendor: entry.vendor,
    label: entry.label,
    kind: entry.kind,
    modeIds: entry.modes.map((mode) => mode.modeId),
    ...(entry.variants?.length ? { variantIds: entry.variants.map((variant) => variant.id) } : {}),
    accepts: acceptsOf(entry),
    ...(availability ? {
      keyStatus: availability.keyStatus,
      usable: availability.usable,
      statusReason: availability.statusReason,
    } : {}),
  };
}

export function modelSpecDetail(entry: AgentModelEntry, availability?: ModelAvailabilityFacts): ModelSpecDetail {
  return {
    ...modelSpecRow(entry, availability),
    ...(entry.archetypeId ? { archetypeId: entry.archetypeId } : {}),
    modelAlias: entry.modelAlias,
    defaultModeId: entry.defaultModeId,
    ...(entry.defaultVariantId ? { defaultVariantId: entry.defaultVariantId } : {}),
    modes: entry.modes,
    ...(entry.variants?.length ? { variants: entry.variants } : {}),
  };
}

/** 按标识找一个模型（大小写不敏感；`vendor` 给了就一起比，同名模型来自两家是两个模型）。 */
export function findModelEntry(
  entries: readonly AgentModelEntry[],
  modelId: string,
  vendor?: string | null,
): AgentModelEntry | undefined {
  const wanted = modelId.trim().toLowerCase();
  const matches = entries.filter((entry) =>
    entry.modelId.toLowerCase() === wanted || (entry.modelAlias ?? "").toLowerCase() === wanted);
  if (!vendor) return matches[0];
  return matches.find((entry) => entry.vendor === vendor) ?? matches[0];
}
