import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAction, evaluateReport } from './check-retarget.mjs'

const passing = { id: 'ok', samples: Array.from({ length: 12 }, () => ({ boneAngleErrorDeg: { hips: 2, spine: 4, leftUpperArm: 8 } })), contactMaxAbsCm: 2.9, standingHipRatio: 0.71 }

test('retarget checker accepts a fully sampled action under every threshold', () => {
  assert.equal(evaluateAction(passing).pass, true)
})

test('retarget checker rejects the reported wrong-bind class even with rendered samples', () => {
  const result = evaluateReport({ actions: [{ id: 'bad-bind', samples: Array.from({ length: 12 }, () => ({ boneAngleErrorDeg: { leftUpperArm: 57 } })), sourceArmsDownTargetHorizontal: true }] })
  assert.equal(result.pass, false)
  assert.equal(result.actions[0].tPose, true)
  assert.equal(result.actions[0].medianDeg, 57)
})

test('retarget checker rejects missing sample coverage and foot/hip violations', () => {
  const result = evaluateAction({ id: 'bad-coverage', samples: [{ boneAngleErrorDeg: { hips: 1 } }], contactMaxAbsCm: 3.01, standingHipRatio: 0.69 })
  assert.equal(result.pass, false)
  assert.equal(result.sampleCount, 1)
})
