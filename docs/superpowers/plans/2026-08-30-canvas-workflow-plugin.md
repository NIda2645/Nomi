# Nomi 固定流程与原生画布插件计划

状态：🚧

## 背景与用户任务

创作者常把“参考图 → 角色/场景 → 生成镜头 → 人工检查”搭好一次，却在每个新项目重复拖节点、连线和调整位置。用户真正要的是把一次成功的工作方法固定下来，而不是学习插件格式或进入市场挑包。最短闭环是：框选一套现有节点 → 保存为流程 → 点击流程复用 → 一次撤销回退。

## 范围

本分支交付：

1. ADR、威胁模型、manifest/版本/占位/所有权合同和开源实现对账。
2. `VITE_NOMI_CANVAS_PLUGINS=true` 才启用的本地插件注册表。
3. 一个编译进 Nomi 的可信“工作流检查点”节点插件，验证注册、注销、React Flow 渲染和受控交互。
4. 框选保存流程、流程入口复用；模板持久化、关闭重开恢复、id 重映射、内部边保留。
5. 有序版本迁移、非法 manifest/不兼容版本、重复 type 冲突和缺失插件占位测试。
6. 插件写入统一 `updateNode`/图事务，覆盖撤销/重做和持久化。

不做：远程/本地任意脚本、插件市场、CSP/preload 改造、全部节点迁移、#223 未定稿的 Agent 工具接入、性能路径改造。

## 实现顺序

1. 先落盘纯类型/注册/迁移/模板模块及单元测试（红 → 绿）。
2. 扩展 GenerationCanvasNode/Snapshot 的可选插件字段和模板字段，保证 normalizer 不丢未知 envelope。
3. 把 renderer 解析接到宿主注册表；缺失时使用占位；内置插件只获得窄回调。
4. 将模板保存/复用接入 Zustand store 的现有写入、undo、persist 机制。
5. 在已有选区工具条加“保存为流程”，在已有画布工具条加流程入口；所有文案走 i18n。
6. 跑分层测试：插件/迁移/模板/normalizer 单测；现有 React Flow canvas 交互回归；typecheck/lint/i18n/tokens/filesize/build。无性能路径变化，不跑全量性能基准。

## 验收不变量

- 任意插件节点都能由 `pluginId + typeId + schemaVersion + state` 重建；缺失插件不丢节点/边。
- 注册表遇到重复 plugin id、重复 type id、内置 kind 冲突或不兼容版本时拒绝注册。
- 模板只复制选区内部边；应用后节点/边获得新 id，保持相对位置和插件状态。
- 模板应用和插件状态编辑各有明确 undo barrier，redo 恢复同一结果。
- 插件组件不持有 store 或 Electron 对象，只能请求宿主回调。
- Agent/MCP/Skill 不新增旁路；#223 继续作为后续接口依赖。

## 回滚与风险

feature flag 默认关闭即可回滚 renderer 插件；模板字段为 optional，旧项目不受影响。若迁移失败，保留原 envelope 并显示占位。若 React Flow 渲染出现异常，关闭 flag 后现有内置节点路径保持不变。风险最高的是持久化 schema/undo 与 renderer 适配，优先用纯函数和接口测试锁住。

## 研究证据

- React Flow custom nodes / `nodeTypes`: https://reactflow.dev/learn/customization/custom-nodes
- React Flow `NodeToolbar`: https://reactflow.dev/api-reference/components/node-toolbar
- Rete.js plugin system: https://retejs.org/docs/concepts/plugin-system/
- Rete.js editor/area/render 分层: https://retejs.org/docs/concepts/editor/
- ComfyUI Manager custom-node lifecycle: https://github.com/comfy-org/ComfyUI-Manager
- n8n node creation docs: https://docs.n8n.io/integrations/creating-nodes/overview/
- n8n workflow templates: https://docs.n8n.io/workflows/templates/
