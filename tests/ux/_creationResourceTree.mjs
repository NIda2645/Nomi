import { clickOrFail, expectVisible } from './_assert.mjs'

/**
 * 「创作内容」那列在分镜页默认是收起的（A-1 刀 1，2026-09-17 用户拍板 grill ③b）。
 * 所以 09-06 那条可达性不变量的说法要跟着精确一档：
 * **不是「树必须一直在屏幕上」，是「在这两个面上，树最多一步就能回来」。**
 * 这个 helper 就是那一步——它点的是真界面上的展开钮，不灌 store、不改 localStorage。
 */

export async function ensureCreationResourceTree(win, where = '') {
  const tree = win.locator('[data-creation-resource-tree="true"]')
  if (await tree.isVisible().catch(() => false)) return false
  // 非活动工作区只是 hidden、并没卸载（WorkspaceSlot 保活），所以必须挑**可见**的那一颗；
  // `.first()` 会先命中隐藏槽里的那颗，等它可见等到超时，看起来像「钮不存在」。
  const expand = win.locator('[data-creation-resource-tree-toggle="expand"]:visible').first()
  if (!(await expand.isVisible().catch(() => false))) {
    throw new Error(`${where || '当前面'}：创作内容列收起了，可中间面板上没有展开钮——这就是回不去了`)
  }
  await clickOrFail(expand, `${where || '当前面'}：点中间面板上的展开钮`)
  await expectVisible(tree, `${where || '当前面'}：点了展开钮，创作内容列还是没回来`)
  return true
}
