// 门岗（R17 最早能拦住的那层）：**动词声明里的每一个字段，都必须真的过桥**。
//
// 根因合同 2026-09-18-draft-shots-drops-candidate §direct_cause：`draft_shots` 的声明写着
// `candidate{providerId,modelId}`（连示例都演示了它），而 `laneVerbTransport.draftShotToPlanShot`
// 解构时**根本没接这个字段**，它连同顶层 `candidate`/`taskKind` 一起被丢掉。后果不是报错，是两种沉默：
// 没保存过默认模型的用户撞「没有配置可用的图片模型」，保存过的用户被静默换成默认模型扣钱。
// 编译器看不见（多余字段解构本来就合法），schema 看不见（翻译输出仍然合法），
// `laneVerbTransport.test.ts` 也看不见（它只核方法名路不路得到）——所以要有这一层。
//
// 判据：给每个字段灌一个**独一无二的值**，翻译一遍，值必须出现在传输参数里（改名不算丢：
// `durationSec→durationSeconds`、`modelKey→modelId`、`changeId→undoToken` 都是按值认的）。
// 真要不带的字段，写进 `NOT_FORWARDED` 并说明理由——沉默地丢不行，说清楚地丢可以。
//
// 加规则前先验它会红（R17）：把 `draftShotToPlanShot` 退回 2026-09-18 之前那版（不接 candidate），
// 这条当场红在 `draft_shots.shots[].candidate.providerId`。
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { VERB_DECLARATIONS } from "../shared/agentCapabilities/verbDeclarations";
import { verbToTransportCall } from "./laneVerbTransport";

/**
 * 声明了但**有意**不过桥的字段：一条一个理由。空理由 = 不算数。
 * 加一条之前先问：模型是照着声明写参数的，它写了而宿主收不到，用户会看见什么？
 */
const NOT_FORWARDED: Record<string, string> = {
  // `draft_shots` 的 patch 分支只改「这一镜的内容」，镜头身份由 `draftId` + 已有草稿定；
  // 新 shotId / role / title 在改稿时没有意义（建稿分支里它们照常过桥，见下面的 create 场景）。
  "draft_shots@patch.shots[].shotId": "patch 改的是已有草稿的内容，镜头身份由 draftId 定",
  "draft_shots@patch.shots[].role": "patch 改的是已有草稿的内容，镜头角色不在改稿面里",
  "draft_shots@patch.shots[].title": "patch 改的是已有草稿的内容，标题不在改稿面里",
  "draft_shots@patch.shots[].durationSec": "candidatePatch 契约不收时长；改稿改时长走 parameters.duration",
};

/** 每个字段一个不会撞的值；值本身就是它的身份。 */
function sampleFor(schema: z.ZodTypeAny, path: string, sentinels: Map<string, unknown>): unknown {
  let node: z.ZodTypeAny = schema;
  while (node instanceof z.ZodOptional || node instanceof z.ZodDefault || node instanceof z.ZodNullable) {
    node = (node as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
  }
  if (node instanceof z.ZodObject) {
    const shape = node.shape as Record<string, z.ZodTypeAny>;
    const value: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(shape)) {
      value[key] = sampleFor(child, path ? `${path}.${key}` : key, sentinels);
    }
    return value;
  }
  if (node instanceof z.ZodArray) {
    return [sampleFor((node as z.ZodArray<z.ZodTypeAny>).element, `${path}[]`, sentinels)];
  }
  if (node instanceof z.ZodEnum) {
    // 枚举只能从它自己的取值里选，所以按值认（不如串那么强，但仍是真判据）。
    const option = (node.options as string[])[0];
    sentinels.set(path, option);
    return option;
  }
  if (node instanceof z.ZodNumber) {
    const value = 1_000 + sentinels.size;
    sentinels.set(path, value);
    return value;
  }
  if (node instanceof z.ZodBoolean) {
    sentinels.set(path, true);
    return true;
  }
  if (node instanceof z.ZodRecord) {
    const key = `rec_${sentinels.size}`;
    sentinels.set(path, key);
    return { [key]: `val_${sentinels.size}` };
  }
  const sentinel = `S_${path.replace(/[^A-Za-z0-9]/g, "_")}_${sentinels.size}`;
  sentinels.set(path, sentinel);
  return sentinel;
}

/** 翻译一遍，返回「丢掉的字段路径」。 */
function droppedFields(verb: string, args: Record<string, unknown>, sentinels: Map<string, unknown>, scenario: string): string[] {
  const translated = verbToTransportCall({ toolCallId: "call-1", toolName: verb, args });
  expect(translated, `${verb} 没有传输映射`).toBeDefined();
  const serialized = JSON.stringify(translated!.call.args);
  const dropped: string[] = [];
  for (const [path, value] of sentinels) {
    const needle = typeof value === "string" ? JSON.stringify(value) : String(value);
    if (serialized.includes(needle)) continue;
    if (NOT_FORWARDED[`${verb}@${scenario}.${path}`]) continue;
    dropped.push(path);
  }
  return dropped;
}

/**
 * 走查里真人会走到的那几条分支。`omit` 删顶层字段，`omitPaths` 删嵌套字段：
 * `modelKey` 与 `candidate.modelId` 是同一件事的两个名字（声明层已经禁止一镜同时写两个），
 * 所以各测一条；顶层 `candidate`/`taskKind` 是**默认值**，只有在镜头自己没写时才该生效，
 * 那一条单独一个场景。
 */
const SCENARIOS: Record<string, Array<{ name: string; omit?: readonly string[]; omitPaths?: readonly string[] }>> = {
  draft_shots: [
    { name: "create", omit: ["draftId", "candidate", "taskKind"], omitPaths: ["shots[].candidate"] },
    { name: "create-candidate", omit: ["draftId", "candidate", "taskKind"], omitPaths: ["shots[].modelKey"] },
    { name: "create-inherits-top-level-defaults", omit: ["draftId"], omitPaths: ["shots[].candidate", "shots[].modelKey", "shots[].taskKind"] },
    { name: "patch", omit: ["candidate", "taskKind"], omitPaths: ["shots[].candidate"] },
  ],
  // 五合一读：`assetReadInputOf` 是个按「填了哪几格」分流的路由器，四条分支互斥——
  // 一次把所有格都填上只会走到其中一条，别的格没过桥是路由的意思，不是丢字段。
  look_at_media: [
    { name: "search", omit: ["assetId", "startFrame", "endFrame", "waveform"] },
    { name: "inspect", omit: ["query", "kinds", "limit", "startFrame", "endFrame", "waveform"] },
    { name: "inspect-range", omit: ["query", "kinds", "limit", "waveform"] },
    { name: "waveform", omit: ["query", "kinds", "limit", "startFrame", "endFrame"] },
  ],
};

const TRANSPORTED = VERB_DECLARATIONS.filter((declaration) =>
  verbToTransportCall({ toolCallId: "probe", toolName: declaration.name, args: {} }) !== undefined);

describe("verbToTransportCall · 声明里的每个字段都要真的过桥", () => {
  it("确实有动词在被检查（阴性对照：目录空了这条也该红）", () => {
    expect(TRANSPORTED.length).toBeGreaterThanOrEqual(8);
  });

  for (const declaration of TRANSPORTED) {
    for (const scenario of SCENARIOS[declaration.name] ?? [{ name: "default" }]) {
      it(`${declaration.name}（${scenario.name}）不丢字段`, () => {
        const sentinels = new Map<string, unknown>();
        const sample = sampleFor(declaration.schema, "", sentinels) as Record<string, unknown>;
        for (const key of scenario.omit ?? []) {
          delete sample[key];
          for (const path of [...sentinels.keys()]) {
            if (path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`)) sentinels.delete(path);
          }
        }
        for (const nested of scenario.omitPaths ?? []) {
          const [root, leaf] = nested.split("[].");
          for (const entry of (sample[root] as Record<string, unknown>[] | undefined) ?? []) delete entry[leaf];
          for (const path of [...sentinels.keys()]) {
            if (path === `${root}[].${leaf}` || path.startsWith(`${root}[].${leaf}.`)) sentinels.delete(path);
          }
        }
        const dropped = droppedFields(declaration.name, sample, sentinels, scenario.name);
        expect(dropped,
          `${declaration.name} 声明了这些字段却没有把它们交给传输层——模型照着声明写，宿主收不到：`
          + `${dropped.join(", ")}。真要不带就写进 NOT_FORWARDED 并说明理由。`).toEqual([]);
      });
    }
  }

  it("阳性对照：判据不是恒真（凭空造一个字段必须被判成丢了）", () => {
    const sentinels = new Map<string, unknown>([["ghost", "S_GHOST_NEVER_FORWARDED"]]);
    expect(droppedFields("generate", { draftId: "op-1" }, sentinels, "default")).toEqual(["ghost"]);
  });
});
