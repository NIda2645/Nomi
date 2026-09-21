// 「等用户」那条轴的主进程这一半：信封里真的带上了 `waiting`，而且只带给该带的那一档。
//
// 为什么单独一条：渲染层那半（`laneViewModel.test.ts`）用的是手写夹具，而手写夹具证不了
// **生产者真的会这么写**——2026-09-21 那两个真 bug（report-C §10.1）就是这么长出来的。
import { describe, expect, it } from 'vitest';

import { laneToolWaitsForUser, LANE_TOOL_WAITING_FOR_USER_CODE_LIST } from '../shared/agentLane/laneToolFailureEnvelope.js';
import { __rememberLaneToolFailureForTest, takeLaneToolFailure } from './laneTools.mjs';

describe('失败信封里的「等用户」轴', () => {
  it('付费确认卡那一档：信封带 waiting，面板据此不画红条', () => {
    __rememberLaneToolFailureForTest('call-spend', {
      code: 'user_sees_spend_card',
      message: 'The user now sees a priced confirmation card in Nomi for 1 shot(s).',
      nextAction: 'STOP.',
    });
    expect(takeLaneToolFailure('call-spend')).toMatchObject({ code: 'user_sees_spend_card', waiting: true });
  });

  it('真错误不带 waiting——用户还得动手的那一档红着才对', () => {
    __rememberLaneToolFailureForTest('call-real', {
      code: 'generation_input_invalid', message: 'shots.0.prompt: Required', nextAction: 'Fix it.',
    });
    expect(takeLaneToolFailure('call-real')?.waiting).toBeUndefined();
  });

  it('判据只有一份，而且是闭合的：渲染层读的就是这个函数算出来的字段', () => {
    for (const code of LANE_TOOL_WAITING_FOR_USER_CODE_LIST) expect(laneToolWaitsForUser(code)).toBe(true);
    expect(laneToolWaitsForUser('generation_execution_failed')).toBe(false);
    expect(laneToolWaitsForUser(undefined)).toBe(false);
  });
});
