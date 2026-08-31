// 「这是不是一台本地 ComfyUI」——渲染层单一真相源（纯函数，零依赖）。
//
// 为什么单独一个模块：这条判据的消费者横跨 onboarding / 画布 / 参数模型 / 花费确认 共 8 处，其中好几处
// 是**纯模块**（promptRequirement、catalogTaskResolve、spendConfirm、parameterControlModel…）。它原本住在
// comfyuiTaskControl.ts 里，而那个文件要 import store / toast / i18n / desktop bridge —— 纯模型逻辑为了一个
// 字符串判断被迫拖进整条 UI 依赖链，parameterControlModel（明写「不含 React、不碰 store」）根本不能用它，
// 于是就地手写了一次 `=== 'comfyui-local'`，把多实例判据写回了字面量（下面正是它踩的坑）。
//
// **判据必须是前缀，不能是字面量**：第 1 台的 vendorKey 是 `comfyui-local`，第 2+ 台是
// `comfyui-local-{slug}`（见 AddComfyuiInstanceButton）。硬比等号只保得住第一台，第二台起会被判成
// 「不是 ComfyUI」→ 走到给中转模型准备的那些启发式分支上去（如凭空补首/尾帧参考槽）。
//
// 与主进程 electron/catalog/types.isComfyuiVendor 同口径。两端各一份是刻意的（渲染层不 import electron
// 侧模块）；改一处必同步另一处，此注释即约定。
const COMFYUI_VENDOR_KEY = 'comfyui-local'

export function isComfyuiVendorKey(vendorKey: string | null | undefined): boolean {
  if (typeof vendorKey !== 'string') return false
  const key = vendorKey.trim()
  return key === COMFYUI_VENDOR_KEY || key.startsWith(`${COMFYUI_VENDOR_KEY}-`)
}
