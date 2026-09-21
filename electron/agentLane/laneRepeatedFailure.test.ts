import { describe, expect, it } from 'vitest';
import { createLaneRepeatedFailureTracker, LANE_REPEATED_FAILURE_BLOCK, LANE_REPEATED_FAILURE_TERMINATE } from './laneRepeatedFailure.mjs';

const WALL = 'The current target could not accept this action (surface_port_stale).\nNext: read again.';

describe('lane repeated-failure tracker', () => {
  it('blocks after the same tool fails the same way three times and terminates at five', () => {
    const tracker = createLaneRepeatedFailureTracker();
    for (let index = 1; index < LANE_REPEATED_FAILURE_BLOCK; index += 1) {
      tracker.note('read_script', true, WALL);
      expect(tracker.block('read_script')).toBeNull();
    }
    tracker.note('read_script', true, WALL);
    const blocked = tracker.block('read_script');
    expect(blocked).toMatchObject({ terminate: false });
    expect(blocked?.reason).toMatch(/failed the same way 3 times in a row/);
    expect(blocked?.reason).toMatch(/after the user's next message/);
    expect(blocked?.reason).not.toMatch(/cannot be done/);
    for (let index = LANE_REPEATED_FAILURE_BLOCK; index < LANE_REPEATED_FAILURE_TERMINATE; index += 1) tracker.note('read_script', true, WALL);
    expect(tracker.block('read_script')).toMatchObject({ terminate: true });
    // 别的工具不受牵连。
    expect(tracker.block('write_script')).toBeNull();
  });

  it('counts only the first line, and any other outcome — success or a different wall — clears the streak', () => {
    const tracker = createLaneRepeatedFailureTracker();
    expect(tracker.note('read_script', true, 'wall A\nline 2')).toBe(1);
    expect(tracker.note('read_script', true, 'wall A\nsomething else')).toBe(2);
    expect(tracker.note('read_script', true, 'wall B')).toBe(1);
    expect(tracker.note('read_script', false, 'ok')).toBe(0);
  });

  // 2026-09-17：用户照着 Agent 的建议去点开文稿页也救不回来——熔断只认工具结果。现在用户再说一句话就解除。
  it('a new user message resets the streak so the tool can be tried again', () => {
    const tracker = createLaneRepeatedFailureTracker();
    for (let index = 0; index < LANE_REPEATED_FAILURE_BLOCK; index += 1) tracker.note('read_script', true, WALL);
    expect(tracker.block('read_script')).not.toBeNull();
    tracker.reset();
    expect(tracker.block('read_script')).toBeNull();
    // 阳性对照：解除后再撞三次，照样拦。
    for (let index = 0; index < LANE_REPEATED_FAILURE_BLOCK; index += 1) tracker.note('read_script', true, WALL);
    expect(tracker.block('read_script')).not.toBeNull();
  });

  // ── 2026-09-21 撞满转提问 ──────────────────────────────────────────────
  //
  // 这一组守的是「三振之后别再让模型自己编一段散文」：此刻缺的是**一个用户答得上来的问题**，
  // 而拒收信里那几个合法值就是现成的选项。

  it('三振之后点名 ask_user，并把上次拒收给的合法值当成选项交出去', () => {
    const tracker = createLaneRepeatedFailureTracker();
    for (let index = 0; index < LANE_REPEATED_FAILURE_BLOCK; index += 1) {
      tracker.note('draft_shots', true, WALL, ['9:16', '16:9', '1:1']);
    }
    const blocked = tracker.block('draft_shots');
    expect(blocked?.reason).toMatch(/ask_user/);
    expect(blocked?.reason).toMatch(/9:16, 16:9, 1:1/);
  });

  it('没拿到合法值时也要点名 ask_user，只是不编造选项', () => {
    const tracker = createLaneRepeatedFailureTracker();
    for (let index = 0; index < LANE_REPEATED_FAILURE_BLOCK; index += 1) tracker.note('read_script', true, WALL);
    const blocked = tracker.block('read_script');
    expect(blocked?.reason).toMatch(/ask_user/);
    expect(blocked?.reason).toMatch(/two to four answers/);
  });

  it('exhausted() 只在真的撞满之后才说话——没撞满时那张卡不该盖「试了 N 次」', () => {
    const tracker = createLaneRepeatedFailureTracker();
    expect(tracker.exhausted()).toBeUndefined();
    tracker.note('draft_shots', true, WALL, ['9:16', '16:9']);
    tracker.note('draft_shots', true, WALL, ['9:16', '16:9']);
    expect(tracker.exhausted(), '才两次就盖上「试了 N 次」是替模型说了一句没发生的话').toBeUndefined();
    tracker.note('draft_shots', true, WALL, ['9:16', '16:9']);
    expect(tracker.exhausted()).toEqual({ attempts: 3, allowed: ['9:16', '16:9'] });
    // 用户又说了一句话 = 回合边界：这一条和 block() 用的是同一个归零点，不许各归各的。
    tracker.reset();
    expect(tracker.exhausted()).toBeUndefined();
  });
});
