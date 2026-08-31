// 数字输入框的「打字中间态」判据（纯函数，靠单测锁真值表）。
//
// 为什么需要它：参数输入框是受控的，每次击键都 parse 回写 meta。想输 `0.4` 的人会依次经过
// `0` → `0.` → `0.4`，而 `0.` 按 HTML 规范**不是合法浮点数**，`input.value` 读出来是空串，
// 于是那一键把 `megapixels=null` 写进了节点 meta——再下一键才写成 0.4。
// 即：打字途中每个中间态都会在 meta 里留下一次假值，也就是会进生成请求参数、
// 会触发任何以该字段为输入的重算。
//
// 校准（2026-08-18 实测，别再照抄旧说法）：因为 `type="number"` 的输入框会**保留用户键入的原文**，
// 所以肉眼看不到「小数点被抹掉」——框里始终是 `0.`。坏的是写出去的值，不是显示。
//
// 治法是「打字途中不回写」：只有当草稿已构成一个完整数值时才提交，中间态留在本地草稿里。
// 判据收在这里而不是写在组件内，是为了它可被单测钉死，且提交与回滚共用同一句判断。

/**
 * 这段草稿是否已经是一个完整的数值（可以安全回写）。
 * 完整：`0.4` `-1` `.5` `1e5`。
 * 中间态（不可回写）：`` `-` `0.` `.` `1e` `1e+`。
 */
export function isCompleteNumericDraft(draft: string): boolean {
  const trimmed = draft.trim()
  if (trimmed === '') return false
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return false
  return Number.isFinite(Number(trimmed))
}

/**
 * 滑杆是否有一个可用的步长。
 * 滑杆只在「步长能把区间切成足够多档」时才好用：denoise 这种 0–1 的区间若拿默认步长 1 去切，
 * 就只剩 0 和 1 两档，等于把参数废掉——那种情况必须退回可直接输入的数字框。
 */
export function hasUsableSliderStep(min: number, max: number, step: number | undefined): boolean {
  const span = max - min
  if (!(span > 0)) return false
  const effective = typeof step === 'number' && step > 0 ? step : 1
  return span / effective >= 2
}
