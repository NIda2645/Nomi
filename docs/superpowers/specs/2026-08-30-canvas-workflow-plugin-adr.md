# ADR: Nomi 原生画布插件与固定流程

日期：2026-08-30
状态：提案（第一阶段实现验证）

## 决策摘要

Nomi 保留 `@xyflow/react`，把“插件”定义为宿主编译进来的、带版本合同的节点渲染与受控行为模块；把“固定流程”定义为用户从当前选区一键保存、之后一键复用的图模板。第一阶段只启用一个 feature-flag 控制的内置插件和本地模板，不支持任意 URL JavaScript、本地任意脚本或插件市场。

用户价值不是“多一个扩展市场”，而是把已经调好的工作方法变成可重复的资产：用户框选一组节点，点击“保存为流程”；下次点击该流程，节点、连线、相对布局和插件状态一起出现，减少重复搭建和漏步骤。插件节点只负责更清楚地呈现一个工作步骤或检查点，不能直接改画布；所有改动仍经过 Nomi 的统一 store、撤销和持久化边界。

## 目标

- 让创作者用框选/点击把一套已验证的画布步骤固定下来，并可在同一项目中复用。
- 允许 Nomi 内置一个可信的插件节点验证自定义渲染、交互、状态迁移和缺失恢复。
- 保留 React Flow 的拖拽、框选、连线和节点注册模型；扩展点只在 Nomi 自己的注册表和渲染适配器。
- 让旧项目、未安装插件的项目打开时不丢节点、边、位置和原始数据。

## 非目标

- 第一阶段不执行任意远程 JavaScript，不采用 `fetch -> Blob -> import`，不开放本地任意脚本。
- 不做插件市场、自动依赖安装、供应商凭据注入、动态 Electron preload API 或 CSP 放宽。
- 不替换 React Flow，不迁移全部现有节点，不建立第二套 Agent/MCP/Skill 能力准入。
- 不把“固定流程”偷偷变成自动执行：模板复用只创建可审查的节点/边，生成和外部调用仍需现有流程确认。

## 用户路径（第一阶段）

1. 用户在画布上完成一套工作步骤，用 React Flow 框选或点选多个节点。
2. 选区工具条出现“保存为流程”，一键保存节点、内部连线、相对位置及插件状态。
3. 用户从“流程”入口选择已保存模板，在当前插入点生成一份新身份的节点簇；一条撤销即可回退。
4. 若模板中的插件未启用，仍渲染“缺失插件”占位节点；原始 `typeId/pluginState`、位置、边和其它字段保留，可在重新启用后恢复。

## 版本与 manifest 合同

内置插件必须提供宿主可验证的 manifest：

```ts
type CanvasPluginManifest = {
  id: `nomi.${string}`
  version: `${number}.${number}.${number}`
  apiVersion: 1
  minNomiVersion?: string
  permissions: readonly ('canvas.read' | 'canvas.write' | 'workflow.read' | 'workflow.write')[]
  nodes: readonly [{ typeId: `${string}/${string}`; schemaVersion: number; defaultSize: { width: number; height: number } }]
}
```

节点落盘使用可前向保留的 envelope，而不是把实现对象序列化进去：

```ts
type CanvasPluginNodeState = {
  pluginId: string
  pluginVersion: string
  typeId: string
  schemaVersion: number
  state: Record<string, unknown>
}
```

`apiVersion` 和 `minNomiVersion` 在注册时校验；版本迁移是按 `from -> to` 严格递进的纯函数，缺一步或迁移抛错就保留原 envelope 并显示占位，不猜测修复。

## React Flow 注册与渲染

React Flow 的 `nodeTypes` 仍由 Nomi 的 viewport 提供。宿主注册表先检查 feature flag、manifest、插件 id 和 `typeId`，再把可信组件映射到一个稳定的 React Flow `type`。节点数据仍是 `GenerationCanvasNode`；插件信息放在可选 `typeId` 与 `pluginState` 字段，`kind` 保留为宿主的闭合语义（第一阶段使用 `text` 作为通用布局/能力类别）。

渲染解析顺序：可信内置插件组件 → 旧节点内置组件 → 缺失/加载失败占位。占位不改变节点数据，也不吞掉边。插件组件只获得宿主提供的窄 render props 和回调（例如 `requestNodePatch`），不获得 Zustand store、Electron API、文件系统或 provider key。

## 模板捕获与应用

模板只包含选中节点、选区内部边、节点相对位置、分类和插件 envelope；外部边不复制，避免跨上下文产生隐式副作用。应用时宿主重新分配节点/边 id，使用现有 `addNode`/图写入边界或同等事务入口，写入一次 undo barrier 和 persist revision。模板记录本身随 generation canvas 文档持久化。

## 冲突与恢复

- 插件 id 冲突、`typeId` 与内置 kind 冲突、同插件重复注册：注册失败并报告确定性错误，绝不 `Map.set` 覆盖。
- 未安装、被 feature flag 禁用、版本不兼容或迁移失败：保留原节点 envelope、位置、边、标题和未知字段，渲染可操作的占位；重新启用后按原 envelope 恢复。
- 未知宿主 `kind` 仍按现有安全 normalizer 处理；插件节点使用已知宿主 kind，因此不会触发旧 kind 丢弃路径。

## 权限与能力模型

第一阶段仅声明 `canvas.read`、`canvas.write`、`workflow.read`、`workflow.write`，且由宿主在调用前检查。插件写入只能通过宿主回调，回调内部走现有 `updateNode`/图事务、撤销、事件和持久化；插件不能调用 `set`、直接改 React Flow 内部状态或绕过能力准入。未声明权限的回调不存在。

## Electron 威胁模型

插件代码属于随 Nomi 构建产物发布的可信代码，仍按 Electron renderer compromise 假设约束：不引入远程代码、不扩展 preload、不把文件/网络/凭据暴露给 renderer 插件；保持 `contextIsolation`、`nodeIntegration: false` 和现有 CSP。未来若要第三方插件，必须另做签名、隔离进程、权限审核和更新回滚设计，不能从本 ADR 推导出可执行加载器。

## Agent / MCP / Skill 所有权边界

画布插件拥有节点呈现和受控的用户交互；画布 store/能力核拥有写入、撤销、持久化和准入；Agent/MCP/Skill 拥有任务编排和工具协议。按 2026-08-30 CLI 检查，#223 仍为 OPEN/Draft，最新 head 为 `b8749782`，GitHub 当时返回 `mergeStateStatus=UNKNOWN`、`mergeable=UNKNOWN`；其近期提交仍在修改 Project Agent Host、canvas read/write transport/admission 和能力合同。因此第一阶段不注册新的 Agent tool、不复制旁路协议。等 #223 合并后的最终接口稳定，再让 Agent 通过现有通用画布读写看到插件 envelope；是否允许创建/调用插件节点需另开合同与准入评审。

## 开源实现对账

- React Flow 官方把自定义节点作为 React 组件，通过稳定的 `nodeTypes` 映射渲染，适合 Nomi 的 renderer 侧注册；其 `NodeToolbar` 也支持选中节点的轻量操作。
- Rete.js 将 editor、area、connection、render 拆成可组合插件和 typed scopes，证明“宿主提供小接口、渲染扩展独立”的方向可行；但 Nomi 不替换 React Flow，也不照搬其 engine。
- ComfyUI 的 custom nodes 与 Manager 形成可安装生态，展示了节点包、禁用和恢复的需求；其脚本/依赖安装模式超出 Nomi 第一阶段威胁边界。
- n8n 的节点包与 workflow templates 证明“可复用流程资产”比“让用户重新配置每个节点”更贴近工作流价值；Nomi 采用本地、可审查模板，不引入社区包安装。

## 评审结论（六角色）

- CTO：先把版本、冲突、占位和写入边界做成不变量，再考虑第三方代码。
- 设计：入口只放在已有选区工具条和一个“流程”入口；不让用户学习 manifest。
- PM：第一阶段验收“减少重复搭建”而不是插件数量；模板是用户可见价值载体。
- 前端：React Flow `nodeTypes` 只由宿主组合，插件组件不接 store，避免第二状态源。
- 后端/桌面：不新增 IPC/preload；文档快照承载模板和插件 envelope。
- 真实用户：框选 → 保存 → 点击复用 → 可撤销；缺失插件仍能看到并恢复原工作。

## 取舍

| 方案 | 用户看到 | 代价/风险 | 决定 |
| --- | --- | --- | --- |
| 远程脚本加载器 | 插件多、安装快 | 任意代码可读本地数据/密钥，无沙箱 | 否 |
| 只做模板 | 流程可复用但节点表达力不变 | 不能验证可扩展渲染 | 部分采用 |
| 内置可信插件 + 本地模板 | 一键复用固定流程，节点可有专用检查点 | 需要 manifest/迁移/占位合同 | 第一阶段 |
| 第三方签名插件 | 生态扩展 | 进程隔离、签名、更新和审核成本高 | 后续议题 |
