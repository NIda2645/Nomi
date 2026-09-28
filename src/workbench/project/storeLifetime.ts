/**
 * 每个 store 数据字段的**寿命声明**（C1，2026-09-18）。
 *
 * 为什么要加这一个轴（审计 `docs/audit/2026-09-17-ownership-lifetime-census.md` §1.1 / §6 C1）：
 * 14 个 zustand store 里只有 3 个被项目释放点碰到，而释放点本身
 * （`releaseWorkbenchProjectSession.ts`，引入于 `0e1be560a`「reduce canvas memory usage」）
 * 是一份**手写清单**——它是「减内存」的副产品，不是「项目会话 owner」的设计。
 * 手写清单的问题不是漏了哪个字段，是**没有一处写着「这个字段归谁」**：
 * 加字段的人没有任何机器提示要不要清它，于是上一个项目的付费待确认卡、分镜规划入口、
 * 素材导入进度就留在了新项目里。
 *
 * 声明之后，释放点从声明**派生**：`releaseWorkbenchProjectRuntimeState` 只是把注册表里
 * 每一条 `releaseProject` 依次调一遍，两份手写清单（22/32、10/13）随之删除。
 *
 * 五个值的分界（这是整份声明的判据，改它等于改语义，别顺手加第六个）：
 * - `process`：活到进程退出。跨项目**刻意**累计或共享的东西。
 * - `window`：活到这个窗口关闭。窗口级 UI 偏好（侧栏宽度、面板折叠）。
 * - `project`：活到离开当前项目。**必须**在释放点被清掉——这条由 `check:store-lifetime` 拦。
 * - `view`：活到那个视图卸载。由组件自己的 effect 清理，不该住在全局 store 里（声明成它 = 一条待收的债）。
 * - `turn`：活到这一轮对话/操作结束。
 */
export type StateLifetime = 'process' | 'window' | 'project' | 'view' | 'turn'

export type StoreLifetimeDeclaration = Readonly<{
  /** store 的导出名，与 `check:store-lifetime` 扫到的名字逐字相同。 */
  store: string
  /** 每个**数据**字段（不含 action）一条。字段集合由门岗与源码比对，少一个或多一个都红。 */
  fields: Readonly<Record<string, StateLifetime>>
  /**
   * 把这个 store 的 `project` 级字段清回初值。
   *
   * 为什么是一个函数而不是一张「字段 → 初值」表：有些字段清不干净——
   * `useSpendConfirmStore.pending` 里挂着一个还没 resolve 的 Promise 回调，
   * 直接置 null 会让等它的那一方**永远等下去**。清理语义只有 store 自己知道。
   */
  releaseProject?: () => void
}>

const registry: StoreLifetimeDeclaration[] = []

/** 声明 + 注册。写在 store 自己文件里（字段列表就在旁边，漂了一眼就看得见）。 */
export function declareStoreLifetime(declaration: StoreLifetimeDeclaration): StoreLifetimeDeclaration {
  registry.push(declaration)
  return declaration
}

/** 注册表快照，供释放点与门岗自测读。 */
export function storeLifetimeRegistry(): readonly StoreLifetimeDeclaration[] {
  return registry
}

/** 这个声明有没有 `project` 级字段——有就必须给得出 `releaseProject`。 */
export function hasProjectScopedFields(declaration: StoreLifetimeDeclaration): boolean {
  return Object.values(declaration.fields).includes('project')
}
