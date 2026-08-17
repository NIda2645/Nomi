// 创作助手「系统提示词」的用户覆盖层（用户 2026-08-17 拍板：提示词搬进设置、可编辑 + 恢复默认）。
//
// 设计要点（P1 加新必删旧 / 单一真相源）：
// 这里**只存用户改过的那几条**。默认提示词的唯一真相源永远是渲染进程的
// `src/workbench/creation/creationAiModes.ts`（`CREATION_AI_MODES`）——把默认值也写盘会产生
// 第二份提示词副本，以后改默认值时老用户永远卡在旧文案上（并行版）。所以：
//   - 某个模式**不在** map 里 = 它在用内置默认值；
//   - 某个模式在 map 里 = 用户显式改过，用它。
// 「恢复默认」= 从 map 里删掉这一条，而不是把默认文本写回去。
//
// 默认值不在主进程这边（它住渲染进程的模式清单），所以「等于默认值就不算覆盖」这条清洗
// 规则没法在主进程判——由调用方（渲染进程）在写入前剔除，主进程只做与默认值无关的清洗。

/** 与 `src/workbench/creation/creationAiModes.ts` 的 `CreationAiModeId` 一一对应。 */
export const SYSTEM_PROMPT_MODE_IDS = [
  "general",
  "story",
  "script",
  "assets",
  "storyboard",
  "seedance",
  "review",
] as const;

export type SystemPromptModeId = (typeof SYSTEM_PROMPT_MODE_IDS)[number];

/**
 * 单条提示词长度上限：32768 字符。
 *
 * 为什么是这个数：现存最长的内置提示词是「素材规划」的 ASSET_MASTER_PROMPT（全资产大师 V3.0，
 * 537 行 / 约 1.2 万字符）。上限要能装下它再留几倍余量给用户自己扩写，同时挡住
 * 「误把整份文稿/日志粘进来」这类把设置文件撑爆、又必然超模型上下文的输入。
 * 32K 字符 ≈ 8-16K token，仍在主流长上下文模型的可用范围内，是个够宽松又不失控的闸。
 * 超长的做**截断**而不是整条丢弃：用户手里那份长文本还在编辑框里，直接丢会让他以为保存成功了。
 */
export const SYSTEM_PROMPT_MAX_LENGTH = 32768;

export type SystemPromptOverrides = {
  schemaVersion: 1;
  /** 只放用户覆盖过的模式；缺席 = 用内置默认值。 */
  prompts: Partial<Record<SystemPromptModeId, string>>;
};

export const DEFAULT_SYSTEM_PROMPT_OVERRIDES: SystemPromptOverrides = {
  schemaVersion: 1,
  prompts: {},
};

const MODE_ID_SET = new Set<string>(SYSTEM_PROMPT_MODE_IDS);

export function isSystemPromptModeId(value: unknown): value is SystemPromptModeId {
  return typeof value === "string" && MODE_ID_SET.has(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * 清洗一份可能来自旧版本 / 被手改过 / 被降级写坏的设置文件。
 * 丢弃：未知模式 id、非字符串值、去空白后为空的值（空 = 没覆盖，不是「覆盖成空提示词」）。
 * 截断：超过 SYSTEM_PROMPT_MAX_LENGTH 的值。
 */
export function normalizeSystemPromptOverrides(value: unknown): SystemPromptOverrides {
  const raw = record(value);
  const rawPrompts = record(raw.prompts);
  const prompts: Partial<Record<SystemPromptModeId, string>> = {};
  for (const [modeId, prompt] of Object.entries(rawPrompts)) {
    if (!isSystemPromptModeId(modeId)) continue;
    if (typeof prompt !== "string") continue;
    // 空白串不是有效覆盖：用户清空输入框的语义是「回默认」，由 UI 的「恢复默认」表达，
    // 存一条空提示词只会让助手拿到空的专长层。
    if (!prompt.trim()) continue;
    prompts[modeId] = prompt.length > SYSTEM_PROMPT_MAX_LENGTH ? prompt.slice(0, SYSTEM_PROMPT_MAX_LENGTH) : prompt;
  }
  return { schemaVersion: 1, prompts };
}
