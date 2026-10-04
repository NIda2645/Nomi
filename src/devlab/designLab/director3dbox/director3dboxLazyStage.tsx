// 设计实验室 · 导演视图（3D-BOX）格子的轻量外壳：先登记就绪持有，再动态加载真正的取景台。
//
// 为什么拆这一层：持有必须在就绪旗举起之前登记（SingleState 的 effect 一跑就开始等），而取景台
// 在 React.lazy 后面——它的 effect 要等模块到了才跑，来不及。所以持有在这里同步登记，交给取景台在场景落定后释放。
import React, { type JSX } from 'react'
import type { AppLocale } from '../../../i18n'
import { holdDesignLabReady } from '../labReadyHold'
import type { Director3dBoxFixture, LabDrive } from './director3dboxCell'

const Stage = React.lazy(() => import('./director3dboxLabKit').then((module) => ({ default: module.Director3dBoxStage })))

export function Director3dBoxLazyStage({ locale, fixture, drive = 'none' }: { locale: AppLocale; fixture: Director3dBoxFixture; drive?: LabDrive }): JSX.Element {
  const [release] = React.useState(() => holdDesignLabReady('director-3dbox'))
  return (
    <React.Suspense fallback={null}>
      <Stage locale={locale} fixture={fixture} drive={drive} release={release} />
    </React.Suspense>
  )
}
