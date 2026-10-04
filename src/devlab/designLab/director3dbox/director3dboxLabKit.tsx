// 设计实验室 · 屏「导演视图（3D-BOX）」的取景台与夹具。
//
// 2026-10-04 用户拍板：导演视图的样张不再手写 HTML——**样张就是生产组件本身**。这一屏每一格渲染的是
// 现役 `DirectorEditor`（开关开时它的默认面就是 `DirectorViewShell`，精修是同一个编辑器里的另一分支），
// 右侧是现役 Agent 面板（v4 实验室的 `ShellStage`：真投影 store + 真 shell）。这里**一行界面 JSX 都不写**，
// 只给三样东西：
//   · 数据：courtyard-standoff 那份 S1 oracle 计划（`evals/director/s1OraclePlans.ts`）交给现役编译器编出来的工程，
//     与评测、真机注入的是同一份——画面上的「青衣女子 / 黑衣侍卫」、镜头窗、实测景别全是 derive 出来的；
//   · 桥：只读的 3D-BOX 开关证明（真机由主进程经 preload 给；实验室没有 Electron，给一份同形状的只读值），
//     以及导演台既有的 E2E 取证桥开关（只用来读「角色挂上没有」，不写任何东西）；
//   · 用户动作：点第 2 张镜头卡 / 点「精修」，走的是界面上那两颗真按钮，不往 store 里塞状态。
// 等待：3D 场景是异步落定的（角色 GLB、动作片段），格子在轻量外壳里登记一个就绪持有（labReadyHold），场景真落定才释放。
// 这个模块只经 director3dboxLazyStage 动态加载：导演台模块图里有模块级的人偶 GLB 预取（CharacterEntity 的
// useGLTF.preload），静态 import 会让实验室**每一屏**都去拉、去解析它，别的屏的动效截图跟着变（2026-10-04 实测
// process-feedback 三格因此稳定翻红）。
import React, { type JSX } from 'react'
import i18n from '../../../i18n'
import type { AppLocale } from '../../../i18n'
import DirectorEditor from '../../../workbench/generationCanvas/nodes/director/DirectorEditor'
import { compileDirectorPlan } from '../../../workbench/generationCanvas/nodes/director/model/compiler/directorPlanCompiler'
import type { DirectorProject } from '../../../workbench/generationCanvas/nodes/director/model/directorTypes'
import type { DirectorE2EBridge } from '../../../workbench/generationCanvas/nodes/director/scene/E2EBridge'
import { assistantPaneWidth } from '../../../workbench/assistantWidthBounds'
import { S1_ORACLE_PLANS } from '../../../../evals/director/s1OraclePlans'
import { ShellStage, labHostState } from '../v4/agentPanelV4LabHost'
import { RefineLayoutContext } from '../../../workbench/generationCanvas/nodes/director/panels/refineLayoutPreview'
import { useWorkbenchStore } from '../../../workbench/workbenchStore'
import type { Director3dBoxFixture, LabDrive, LabRefineLayout, LabStep } from './director3dboxCell'
/** 右侧 Agent 面板宽：与 v4 实验室同一取值，导演视图占的画布宽因此与真机 1280 窗口一致（≈858）。 */
const AGENT_PANEL_WIDTH = 390

const PLAN_ID = 'courtyard-standoff'
// 节点标题是画布节点的数据（用户起的名字），不是界面文案：三镜格用样张里那个工程名，空工程用新建导演台节点的默认名
const COURTYARD_TITLE: Record<AppLocale, string> = { 'zh-CN': '古装庭院对峙', en: 'Courtyard standoff' }

let courtyardProject: DirectorProject | null = null
/** 现役编译器把 oracle 计划编成工程；编不出来就当场抛（夹具坏了要红，不许悄悄换成空工程）。 */
function courtyardFixture(): DirectorProject {
  if (courtyardProject) return courtyardProject
  const compiled = compileDirectorPlan(S1_ORACLE_PLANS[PLAN_ID])
  if (!compiled.ok) throw new Error(`director3dbox lab: ${PLAN_ID} 编译失败：${compiled.errors.join('; ')}`)
  courtyardProject = compiled.project
  return courtyardProject
}

// 只读开关证明：形状与 preload 给渲染端的那份一致（src/desktop/bridge.ts 的 featureFlags.director3dbox）。
// 开关关 = 旧导演台（没有导演视图，壳铺满窗口）——精修新布局要证明「旧导演台一起变，不分两套」。
function installReadOnlyBridge(flag: 'on' | 'off'): void {
  const host = window as unknown as { nomiDesktop?: Record<string, unknown> }
  host.nomiDesktop = {
    ...(host.nomiDesktop ?? {}),
    featureFlags: { director3dbox: { enabled: flag === 'on', source: 'env', fingerprint: `director3dbox:${flag}:2026-11-15`, expiresOn: '2026-11-15' } },
  }
  try {
    window.localStorage.setItem('__nomiE2E', '1')
  } catch {
    // 无存储：取证桥不挂，下面的就绪等待会超时并报错，不会静默截一张空场景
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function directorBridge(): DirectorE2EBridge | undefined {
  return (window as unknown as { __nomiDirectorE2E?: DirectorE2EBridge }).__nomiDirectorE2E
}

const SETTLE_MAX_FRAMES = 1800
const SETTLE_TAIL_FRAMES = 30

/** 场景落定 = 每个角色的模型挂上了、每个用到的动作片段不再「加载中」。 */
function sceneSettled(project: DirectorProject | null): boolean {
  const bridge = directorBridge()
  if (!bridge) return false
  if (!project) return true
  const scene = project.scenes.find((item) => item.id === project.activeSceneId) ?? project.scenes[0]
  for (const object of scene?.objects ?? []) {
    if (object.type !== 'character' || !object.visible) continue
    if (bridge.findAll('characterMount', object.id).length === 0) return false
    for (const clip of object.actionClips ?? []) {
      if (clip.actionPose && bridge.poseClipStatus(clip.actionPose) === 'loading') return false
    }
  }
  return true
}

async function clickWhenPresent(selector: string): Promise<void> {
  for (let frame = 0; frame < SETTLE_MAX_FRAMES; frame += 1) {
    const element = document.querySelector<HTMLButtonElement>(selector)
    if (element) {
      element.click()
      await nextFrame()
      return
    }
    await nextFrame()
  }
  throw new Error(`director3dbox lab: 等不到 ${selector}`)
}

async function clickTextWhenPresent(selector: string, text: string): Promise<void> {
  for (let frame = 0; frame < SETTLE_MAX_FRAMES; frame += 1) {
    const element = [...document.querySelectorAll<HTMLElement>(selector)].find((item) => item.textContent?.trim() === text)
    if (element) {
      element.click()
      await nextFrame()
      return
    }
    await nextFrame()
  }
  throw new Error(`director3dbox lab: 等不到 ${selector} 里的「${text}」`)
}

async function pointerWhenPresent(selector: string, text: string): Promise<void> {
  for (let frame = 0; frame < SETTLE_MAX_FRAMES; frame += 1) {
    const element = [...document.querySelectorAll<HTMLElement>(selector)].find((item) => item.textContent?.trim() === text)
    if (element) {
      const box = element.getBoundingClientRect()
      const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
      element.dispatchEvent(new PointerEvent('pointerdown', init))
      await nextFrame()
      element.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }))
      window.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }))
      await nextFrame()
      return
    }
    await nextFrame()
  }
  throw new Error(`director3dbox lab: 等不到 ${selector} 里的「${text}」`)
}

async function runStep(step: LabStep): Promise<void> {
  if ('click' in step) return clickWhenPresent(step.click)
  if ('pointer' in step) return pointerWhenPresent(step.pointer.selector, step.pointer.text)
  if ('clickText' in step) return clickTextWhenPresent(step.clickText.selector, step.clickText.text)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: step.press, bubbles: true, cancelable: true }))
  await nextFrame()
}

async function waitSettled(project: DirectorProject | null): Promise<void> {
  for (let frame = 0; frame < SETTLE_MAX_FRAMES; frame += 1) {
    if (sceneSettled(project)) {
      for (let tail = 0; tail < SETTLE_TAIL_FRAMES; tail += 1) await nextFrame()
      return
    }
    await nextFrame()
  }
  throw new Error('director3dbox lab: 3D 场景没有落定（角色模型或动作片段一直没就绪）')
}

async function driveAndSettle(drive: LabDrive, steps: readonly LabStep[], project: DirectorProject | null): Promise<void> {
  if (drive !== 'none') await clickWhenPresent('[data-testid="director-shot-2"]')
  if (drive === 'shot-2-refine') await clickWhenPresent('[data-testid="director-view-header"] button[aria-pressed="false"]')
  // 场景先落定再点：选中 / 进机位视角都要角色挂上之后才有意义，点完再等一次（选中描边、机位视角会重排画面）
  if (steps.length > 0) await waitSettled(project)
  for (const step of steps) await runStep(step)
  await waitSettled(project)
}

const NO_STEPS: readonly LabStep[] = []

export type Director3dBoxStageProps = {
  locale: AppLocale
  fixture: Director3dBoxFixture
  drive?: LabDrive
  /** 精修「选中才出」格在 drive 之后要点的真按钮 */
  steps?: readonly LabStep[]
  layout?: LabRefineLayout
  flag?: 'on' | 'off'
  /** Agent 面板宽：缺省 390（壳 858）；窄格给 520，把壳压到 728（真机最小窗 1100 × 默认 Agent 时的壳宽） */
  agentWidth?: number
  release: () => void
}

export function Director3dBoxStage({ locale, fixture, drive = 'none', steps = NO_STEPS, layout = 'docked-cards', flag = 'on', agentWidth = AGENT_PANEL_WIDTH, release }: Director3dBoxStageProps): JSX.Element {
  React.useMemo(() => {
    installReadOnlyBridge(flag)
    // 导演台壳的右缘读工作台 store 的 Agent 宽（真机同一个值），实验室把它设成这一格要的宽
    useWorkbenchStore.getState().setAssistantWidth(agentWidth)
    void i18n.changeLanguage(locale)
  }, [agentWidth, flag, locale])
  const project = React.useMemo(() => (fixture === 'courtyard' ? courtyardFixture() : null), [fixture])
  React.useEffect(() => {
    let alive = true
    driveAndSettle(drive, steps, project)
      .catch((error: unknown) => {
        // 抛到页面层：视觉基线把 pageerror 当失败，不会拿一张没落定的图去比
        if (alive) window.setTimeout(() => { throw error })
      })
      .finally(release)
    return () => {
      alive = false
      release()
    }
  }, [drive, project, release, steps])
  const title = project ? COURTYARD_TITLE[locale] : i18n.t('director.node.title')
  const noop = React.useCallback(() => undefined, [])
  return (
    <>
      <RefineLayoutContext.Provider value={layout}>
        <DirectorEditor rawProject={project ?? undefined} nodeTitle={title} readOnly onClose={noop} onProjectChange={noop} />
      </RefineLayoutContext.Provider>
      <div className="fixed inset-y-0 right-0 bg-nomi-bg p-4" style={{ width: assistantPaneWidth(agentWidth) }}>
        <ShellStage surface="generation" snapshot={labHostState({ items: [] })} width={agentWidth} height={window.innerHeight - assistantPaneWidth(0)} />
      </div>
    </>
  )
}
