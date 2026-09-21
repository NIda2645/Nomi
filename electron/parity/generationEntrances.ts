/**
 * 生成入口登记表（**单一数据源**）。
 *
 * 一条记录回答五问的前两问：「这是用户的哪个动作」「它最终汇到哪个函数」。
 * 门岗 `scripts/check-generation-entrances.mjs` 反向扫代码里所有能组装并发出供应商生成请求的
 * 调用点，凡是没出现在这张表（经 `scripts/generation-entrances-ledger.json`）里的一律红——
 * **新入口不登记即红**。对等矩阵正向跑这张表，逐字段比出站报文。
 *
 * `engine` 的两个取值就是今天真实存在的两台发动机（sweep2 §二 表 1）：
 *   · `runtime`  ＝ `electron/runtime.ts:309 runTask`；参数由 `extras` 直通，档案声明什么就送什么。
 *   · `provider` ＝ `createGenerationProviderBootstrap()` 造出来的 provider；参数先过
 *                  `executionContract.ts:111 compileParameters` 的闭合白名单。
 */

export type ParityEngine = "runtime" | "provider";

export type GenerationEntrance = {
  id: string;
  /** 用户动作（用户镜头）。 */
  userAction: string;
  engine: ParityEngine;
  /** 入口自己那一段代码（不是共享下游）。 */
  entrySite: string;
  /** 真正发出请求的那个函数。 */
  dispatchSite: string;
  /** 发送前是否做 `@[asset:…]` → `@imageN` 的最终投影（A5 那条轴）。 */
  projectsPromptMentions: boolean;
  /** QA 定向重试追加的指令（只此一路有）。 */
  appendsRetryDirective: boolean;
  /**
   * 「按构造就该逐字节相同」的分组。同组之间的差异一定是回归（有人给其中一路加了私有预处理），
   * 所以矩阵对同组额外加一条硬断言。
   */
  dispatchProfile: string;
};

export const GENERATION_ENTRANCES: readonly GenerationEntrance[] = [
  {
    id: "canvas-node",
    userAction: "在画布节点上按生成（矩阵基准）",
    engine: "runtime",
    entrySite: "src/workbench/generationCanvas/runner/catalogTaskActions.ts:304-315",
    dispatchSite: "electron/runtime.ts:309 runTask",
    projectsPromptMentions: true,
    appendsRetryDirective: false,
    dispatchProfile: "runtime+projection",
  },
  {
    id: "shot-table-row",
    userAction: "分镜表某一行上按生成（落画布后共用画布 runner）",
    engine: "runtime",
    entrySite: "src/workbench/creation/storyboard/exec/storyboardProjection.ts",
    dispatchSite: "electron/runtime.ts:309 runTask",
    projectsPromptMentions: true,
    appendsRetryDirective: false,
    dispatchProfile: "runtime+projection",
  },
  {
    id: "retake",
    userAction: "重拍（审片定向重试，带一句机器写的纠正指令）",
    engine: "runtime",
    entrySite: "src/workbench/generationCanvas/runner/catalogTaskActions.ts:311-315 promptSuffix",
    dispatchSite: "electron/runtime.ts:309 runTask",
    projectsPromptMentions: true,
    appendsRetryDirective: true,
    dispatchProfile: "runtime+projection+retry",
  },
  {
    id: "external-mcp-generate",
    userAction: "外部 MCP 单发生成（`nomi_generate` / `generate`）",
    engine: "runtime",
    entrySite: "electron/capabilityCore/core.ts:580-612",
    dispatchSite: "electron/runtime.ts:309 runTask",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "runtime+raw",
  },
  {
    id: "try-model",
    userAction: "接入试跑一次（`nomi_try_model`）",
    engine: "runtime",
    entrySite: "electron/capabilityCore/modelOnboarding/tryModel.ts:115",
    dispatchSite: "electron/runtime.ts:309 runTask",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "runtime+raw",
  },
  {
    id: "agent-panel-spend-confirm",
    userAction: "Agent 面板付款卡上按「确认」",
    engine: "provider",
    entrySite: "electron/capabilityCore/appIntegrationSpendConfirm.ts",
    dispatchSite: "electron/capabilityCore/generationRuntimeAdapter.ts:282-292",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "provider",
  },
  {
    id: "submit-execution-plan",
    userAction: "分镜表「提交执行计划」",
    engine: "provider",
    entrySite: "electron/capabilityCore/mcpGenerationTools.ts:308 createGenerationPlanningHandler",
    dispatchSite: "electron/capabilityCore/generationRuntimeAdapter.ts:282-292",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "provider",
  },
  {
    id: "external-mcp-start-generation",
    userAction: "外部 MCP `nomi_start_generation`",
    engine: "provider",
    entrySite: "electron/capabilityCore/mcpStdioServer.ts:326-380",
    dispatchSite: "electron/capabilityCore/generationRuntimeAdapter.ts:282-292",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "provider",
  },
  {
    id: "auto-run-batch",
    userAction: "全自动 / 批量调度（Run 自己往下推）",
    engine: "provider",
    entrySite: "electron/productionRun/productionGenerationSubmission.ts:465",
    dispatchSite: "electron/capabilityCore/generationRuntimeAdapter.ts:282-292",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "provider",
  },
  {
    id: "continue-batch",
    userAction: "续批（多镜批次调度器接着往下发）",
    engine: "provider",
    entrySite: "electron/productionRun/multiShotBatchScheduler.ts",
    dispatchSite: "electron/capabilityCore/generationRuntimeAdapter.ts:282-292",
    projectsPromptMentions: false,
    appendsRetryDirective: false,
    dispatchProfile: "provider",
  },
];

/** 矩阵的基准入口：用户最常走、也是今天唯一把提示词投影做完的那一条。 */
export const BASELINE_ENTRANCE_ID = "canvas-node";

export function entranceById(id: string): GenerationEntrance {
  const hit = GENERATION_ENTRANCES.find((entrance) => entrance.id === id);
  if (!hit) throw new Error(`unregistered generation entrance: ${id}`);
  return hit;
}
