// 未登记状态动词的有界容忍规则（根因修复回归）。
//
// 病根：归一把「不认得的动词」压成 queued，而 queued = 「继续轮询」的指令。上游返回
// status:"failure" 时，系统读成「还在排队」，把预算烧完也没把真因报出来 —— 用户看到的是
// 任务永远转圈，既不出结果也不报错（2026-08-11 真实往返测试实测）。
//
// 补动词表只是止血。这里钉死的是根因侧的规则本身：不认得的动词**先容忍、后判死**，
// 且判死必须同时满足「连续够多次」与「持续够久」，判死后错误信息要如实带上原始动词。
// 见 docs/plan/2026-08-11-unrecognized-task-status-root-fix.md。
import { describe, expect, it } from "vitest";
import { advanceUnrecognizedStatusStreak, unrecognizedStatusExhausted } from "./taskResultQuery";

const T0 = 1_700_000_000_000;
/** 与 taskResultQuery 的常量对齐：4 次 + 120s 都要够。 */
const MIN_POLLS = 4;
const GRACE_MS = 120_000;

/** 模拟连续 n 轮都收到同一个未知动词，每轮间隔 intervalMs。 */
function pollUnrecognized(verb: string, rounds: number, intervalMs: number) {
  let streak = advanceUnrecognizedStatusStreak(undefined, verb, T0);
  for (let i = 1; i < rounds; i += 1) {
    streak = advanceUnrecognizedStatusStreak(streak, verb, T0 + i * intervalMs);
  }
  return { streak, now: T0 + (rounds - 1) * intervalMs };
}

describe("未知动词连击：先容忍", () => {
  it("第一次见到未知动词绝不判死（可能只是我们没登记的「进行中」）", () => {
    const streak = advanceUnrecognizedStatusStreak(undefined, "failure", T0);
    expect(streak).toEqual({ verb: "failure", polls: 1, firstSeenAt: T0 });
    expect(unrecognizedStatusExhausted(streak, T0)).toBe(false);
  });

  it("次数够了但时间不够 → 继续等（视频 3s 一轮，4 轮才 9s）", () => {
    const { streak, now } = pollUnrecognized("failure", MIN_POLLS, 3_000);
    expect(streak?.polls).toBe(MIN_POLLS);
    expect(unrecognizedStatusExhausted(streak, now)).toBe(false);
  });

  it("时间够了但次数不够 → 继续等（两个条件是 AND，不是 OR）", () => {
    const streak = advanceUnrecognizedStatusStreak(undefined, "failure", T0);
    expect(unrecognizedStatusExhausted(streak, T0 + GRACE_MS + 1)).toBe(false);
  });

  it("中途出现认得的动词 → 连击清零（真在跑的任务通常会经过认得的状态）", () => {
    const { streak } = pollUnrecognized("failure", MIN_POLLS, 60_000);
    expect(advanceUnrecognizedStatusStreak(streak, "", T0 + 300_000)).toBeUndefined();
  });
});

describe("未知动词连击：后判死", () => {
  it("次数与时长都够 → 判定耗尽（可翻成失败）", () => {
    const { streak, now } = pollUnrecognized("failure", MIN_POLLS, 40_000);
    expect(now - T0).toBeGreaterThanOrEqual(GRACE_MS);
    expect(unrecognizedStatusExhausted(streak, now)).toBe(true);
  });

  it("上游在两个未知动词间来回切，不能重置时钟绕过判定", () => {
    // 若换动词就重新起算 firstSeenAt，这个循环将永远不耗尽 —— 等于修复不存在。
    let streak = advanceUnrecognizedStatusStreak(undefined, "weird-a", T0);
    const verbs = ["weird-b", "weird-a", "weird-b", "weird-a"];
    verbs.forEach((verb, index) => {
      streak = advanceUnrecognizedStatusStreak(streak, verb, T0 + (index + 1) * 40_000);
    });
    expect(streak?.firstSeenAt).toBe(T0);
    expect(unrecognizedStatusExhausted(streak, T0 + verbs.length * 40_000)).toBe(true);
    // 报错要用**最后看到**的那个词，才对得上用户当下在上游看到的状态。
    expect(streak?.verb).toBe("weird-a");
  });

  it("判死后保留原始动词，好让错误信息如实报出来 + 我们据此补表", () => {
    const { streak } = pollUnrecognized("Rejected", MIN_POLLS, 40_000);
    expect(streak?.verb).toBe("Rejected");
  });
});
