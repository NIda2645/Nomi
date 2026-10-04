import { describe, expect, it } from 'vitest'
import { compileDirectorPlan } from './compiler/directorPlanCompiler'
import { activeShotIndexAt, formatPlayheadSeconds, summarizeDirectorShots, type DirectorShotSummary } from './directorShotSummaries'
import { directorOverviewPose } from './directorOverviewPose'
import { createDefaultProject } from './directorProject'
import { S1_ORACLE_PLANS } from '../../../../../../evals/director/s1OraclePlans'

function compiled(id: string) {
  const result = compileDirectorPlan(S1_ORACLE_PLANS[id])
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.project
}

describe('导演视图镜头条摘要（实测，不读计划值）', () => {
  it('主体取画面里最大的角色，不是场景件：t2-courtyard 三镜量回计划的景别与运镜', () => {
    // 旧实现取 frame.objects 的第一个键 = 地面方块，三镜量成「远景 / 远景 / 全景」
    const shots = summarizeDirectorShots(compiled('t2-courtyard'))
    expect(shots.map((shot) => [shot.shotSize, shot.move])).toEqual([['全景', 'follow'], ['中景', 'static'], ['特写', 'push_in']])
  })

  it('这一镜在做什么只取工程里真实的动作片段；没有就留空，界面说明缺动作片段', () => {
    const shots = summarizeDirectorShots(compiled('courtyard-standoff'))
    expect(shots).toHaveLength(4)
    expect(shots[0].actions.map((action) => [action.objectName, action.actionPose])).toEqual([['青衣女子', 'standard_walk']])
    expect(shots[1].actions.map((action) => action.objectName)).toEqual(['青衣女子', '黑衣侍卫'])
    expect(shots[2].actions).toEqual([])
    expect(shots[3].actions).toEqual([])
  })

  it('空工程没有镜头', () => {
    expect(summarizeDirectorShots(createDefaultProject('empty'))).toEqual([])
  })
})

describe('播放头落在哪一镜', () => {
  const shots = [0, 4.25, 8.25].map((start, index, all) => ({ start, end: all[index + 1] ?? 12, cameraId: null, shotSize: null, move: 'static', actions: [] })) as DirectorShotSummary[]
  it('点卡跳到开头后量化到 30fps 网格，差半帧仍算这一镜', () => {
    expect(activeShotIndexAt(shots, 4.25)).toBe(1)
    expect(activeShotIndexAt(shots, 4.25 - 1 / 120)).toBe(1)
    expect(activeShotIndexAt(shots, 4.2)).toBe(0)
  })
  it('超过末尾仍是最后一镜；没有镜头 = -1', () => {
    expect(activeShotIndexAt(shots, 99)).toBe(2)
    expect(activeShotIndexAt([], 1)).toBe(-1)
  })
  it('秒数读数两位整数一位小数', () => {
    expect(formatPlayheadSeconds(4.9)).toBe('04.9')
    expect(formatPlayheadSeconds(11.9999)).toBe('12.0')
  })
})

describe('导演视图进场取景', () => {
  it('空场景不动自由相机；有角色时从 +Z 抬高俯看角色中心', () => {
    expect(directorOverviewPose(createDefaultProject('empty').scenes[0])).toBeNull()
    const scene = compiled('courtyard-standoff').scenes[0]
    const pose = directorOverviewPose(scene)
    expect(pose).not.toBeNull()
    const actors = scene.objects.filter((object) => object.type === 'character')
    const centerZ = actors.reduce((sum, object) => sum + object.position.z, 0) / actors.length
    expect(pose!.position.z).toBeGreaterThan(centerZ)
    expect(pose!.position.y).toBeGreaterThan(2)
    expect(pose!.pitch).toBeGreaterThan(0)
  })
})
