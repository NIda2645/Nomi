// 「shots: must be array」那 12 次到底是什么——2026-09-21 真实轨迹的回归锁。
//
// 12 段被模型写成 JSON 字符串的 `shots`，**12 段全部解不出来**，而且全部坏在同一个位置：
// `"durationSec": ` 之后跟着 `наш0` / `工商5` / `keyframe = 4` / `补充删除` 这类乱码。
// 容忍层（pi 官方的 `prepareArguments` 钩子，本仓的 `modelArgumentTolerance`）做的是对的：
// 它捏不回来。错的是模型收到的那句话——「shots: must be array」在描述另一个问题，
// 于是模型把同样坏掉的载荷再发一遍（A5 一轮发了三次）。
import { describe, expect, it } from "vitest";

import { MalformedJsonArgumentError, modelArgumentTolerance } from "./modelArgumentTolerance";
import { VERB_DECLARATIONS } from "./verbDeclarations";

const tolerate = modelArgumentTolerance({ arrayFields: ["shots"] });

/** A11 那一次的原文（截短，断点逐字保留）。 */
const A11_BROKEN = '[{\n  "title": "夜归人走近",\n  "prompt": "深夜十一点",\n  "durationSec": наш0,\n  "modelId": "bytedance/seedance"\n}]';

describe("模型把数组写成 JSON 文本", () => {
  it("文本是好的 → 捏回数组，一次往返都不花", () => {
    expect(tolerate({ shots: '[{"prompt":"一只猫"}]' })).toEqual({ shots: [{ prompt: "一只猫" }] });
  });

  it("单个对象 → 一元数组（pi 自己的 edit 工具也这么做）", () => {
    expect(tolerate({ shots: { prompt: "一只猫" } })).toEqual({ shots: [{ prompt: "一只猫" }] });
  });

  it("文本坏了 → 说清坏在哪，而不是「must be array」", () => {
    let thrown: unknown;
    try { tolerate({ shots: A11_BROKEN }) } catch (error) { thrown = error }
    expect(thrown).toBeInstanceOf(MalformedJsonArgumentError);
    const message = (thrown as Error).message;
    expect(message).toContain("not valid JSON");
    // 模型必须看见自己写坏的那几个字，否则它只会把同一段再发一遍。
    // （V8 的 JSON 报错自己就带一段原文摘录；断点在 `"durationSec": ` 之后那串乱码上。）
    expect(message).toContain("наш0");
    expect(message).toContain('Send "shots" as a real JSON value');
  });

  it("阳性对照：不像 JSON 的字符串照旧原样过去，由 schema 去报「期望数组」", () => {
    expect(tolerate({ shots: "请帮我拆五镜" })).toEqual({ shots: "请帮我拆五镜" });
  });
});

// 时长有两个家，正是那 12 段 JSON 断掉的地方。判据与「一镜两个模型身份」同一个函数。
describe("一镜把同一件事写了两遍", () => {
  const prepare = (args: unknown) => {
    const spec = VERB_DECLARATIONS.find((declaration) => declaration.name === "draft_shots")!;
    return spec.prepareArguments!(args);
  };

  it("durationSec 与 parameters.duration 打架 → 当场点名两个数", () => {
    expect(() => prepare({ shots: [{ prompt: "镜4", durationSec: 43.7, parameters: { duration: 5 } }] }))
      .toThrow(/durationSec=43.7 and parameters.duration=5/);
  });

  it("两处写的是同一个数 → 放行（那不是歧义）", () => {
    expect(() => prepare({ shots: [{ prompt: "镜4", durationSec: 5, parameters: { duration: 5 } }] })).not.toThrow();
  });

  it("modelId 与 candidate.modelId 打架 → 照旧拒（这条本来就在，合并之后一个字没丢）", () => {
    expect(() => prepare({ shots: [{ prompt: "镜4", modelId: "a", candidate: { providerId: "p", modelId: "b" } }] }))
      .toThrow(/two different models/);
  });

  it("说明书自己也只承认一个家——否则模型读到的和宿主执行的不是一回事", () => {
    const spec = VERB_DECLARATIONS.find((declaration) => declaration.name === "draft_shots")!;
    const printed = JSON.stringify(spec.schema);
    expect(printed).toContain("This is the only place to set length");
    expect(printed).toContain("minus length — length is durationSec");
  });
});
