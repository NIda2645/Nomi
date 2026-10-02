/**
 * 节点浮条的水平夹取：浮条整条必须留在**可见画布**里（画布舞台 = 右侧 Agent 面板让出来之后的那块），
 * 左右都夹住。节点贴着画布边时，浮条比节点宽得多，不夹就会被舞台裁掉一截（「重拍这镜」现在只住在浮条里，
 * 被裁掉就等于没有入口）。
 *
 * 全是**屏幕像素**：`rect*` 是浮条此刻的屏幕位置（已带着当前的 `appliedShift`），`min / max` 是舞台内缘。
 * 返回新的位移（屏幕像素）：先把「没位移时的自然位置」还原出来再算，所以画布平移回来之后位移会自己归零，
 * 不会留一个过期的偏移。浮条比舞台还宽时左对齐（左边的动作先露出来）。
 */
export function floatingToolbarShift({ rectLeft, rectRight, appliedShift, min, max }: {
  rectLeft: number
  rectRight: number
  appliedShift: number
  min: number
  max: number
}): number {
  const naturalLeft = rectLeft - appliedShift
  const naturalRight = rectRight - appliedShift
  if (naturalRight - naturalLeft >= max - min) return min - naturalLeft
  if (naturalLeft < min) return min - naturalLeft
  if (naturalRight > max) return max - naturalRight
  return 0
}
