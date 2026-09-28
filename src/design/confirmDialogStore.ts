// confirmDialog 的指令层（与 ConfirmDialogHost 组件分文件：react-refresh 要求
// 组件文件只导出组件）。API 说明见 confirmDialog.tsx 头注释。
export type DialogKind = 'confirm' | 'alert' | 'prompt'
export type DialogTone = 'default' | 'info' | 'danger'

export type DialogRequest = {
  kind: DialogKind
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 危险动作（删除等）：确认键走警示色。 */
  danger?: boolean
  tone?: DialogTone
  placeholder?: string
  initialValue?: string
  /**
   * 确认框里的一个勾选项（默认不勾）。
   *
   * 为什么放进这只原语而不是各页自己画一个：需要它的都是「同一个动作有两种后果」的确认——
   * 导入配置就是（默认保留本机已有，勾上才用包里的覆盖）。各页自己画，意味着每一处都要
   * 重新想一遍遮罩、焦点、ESC、按钮顺序；而这四件事正是 confirmDialog 存在的理由。
   */
  toggle?: { label: string }
  resolve: (value: boolean | string | null) => void
}

let dispatchRequest: ((request: DialogRequest) => void) | null = null
const preMountQueue: DialogRequest[] = []

function submit(request: DialogRequest): void {
  if (dispatchRequest) dispatchRequest(request)
  else preMountQueue.push(request)
}

/** Host 挂载时注册分发器；卸载传 null。返回挂载前积压的请求。 */
export function bindConfirmDialogHost(dispatch: ((request: DialogRequest) => void) | null): DialogRequest[] {
  dispatchRequest = dispatch
  if (!dispatch) return []
  const backlog = preMountQueue.splice(0, preMountQueue.length)
  return backlog
}

/** 确认框：resolve true=确认 / false=取消（含 ESC/点遮罩）。 */
export function confirmDialog(options: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  tone?: DialogTone
}): Promise<boolean> {
  return new Promise((resolve) => {
    submit({ kind: 'confirm', ...options, resolve: (value) => resolve(value === true) })
  })
}

/**
 * 带一个勾选项的确认框。取消时 `confirmed=false`，此时 `toggled` 没有意义、恒为 false。
 * 与 `confirmDialog` 是同一条渲染管线（同一个 Host、同一只 DialogRequest），不是第二套弹窗。
 */
export function confirmDialogWithToggle(options: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  tone?: DialogTone
  toggleLabel: string
}): Promise<{ confirmed: boolean; toggled: boolean }> {
  const { toggleLabel, ...rest } = options
  return new Promise((resolve) => {
    submit({
      kind: 'confirm',
      ...rest,
      toggle: { label: toggleLabel },
      resolve: (value) => resolve({ confirmed: value !== false && value !== null, toggled: value === 'toggle-on' }),
    })
  })
}

/** 提示框（替代 window.alert）：仅一个「知道了」键。 */
export function alertDialog(options: { title: string; message?: string; confirmLabel?: string }): Promise<void> {
  return new Promise((resolve) => {
    submit({ kind: 'alert', ...options, resolve: () => resolve() })
  })
}

/** 输入框（替代 window.prompt）：resolve 输入串 / null=取消。 */
export function promptDialog(options: {
  title: string
  message?: string
  placeholder?: string
  initialValue?: string
  /**
   * 确认框里的一个勾选项（默认不勾）。
   *
   * 为什么放进这只原语而不是各页自己画一个：需要它的都是「同一个动作有两种后果」的确认——
   * 导入配置就是（默认保留本机已有，勾上才用包里的覆盖）。各页自己画，意味着每一处都要
   * 重新想一遍遮罩、焦点、ESC、按钮顺序；而这四件事正是 confirmDialog 存在的理由。
   */
  toggle?: { label: string }
  confirmLabel?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    submit({
      kind: 'prompt',
      ...options,
      resolve: (value) => resolve(typeof value === 'string' ? value : null),
    })
  })
}
