# PR 802 反方与一手依据

2026-09-16 已读 Electron 官方 contextBridge 文档：Error 自定义字段丢失是明确契约；https://github.com/electron/electron/blob/main/docs/api/context-bridge.md#parameter--error--return-type-support 。应过桥前编码普通数据，不增加错误 message 猜测补丁。

已读 React Flow 12.11.5 安装源码：NodeWrapper 依 nodeHasDimensions 隐藏未测量节点；adoptUserNodes 新对象重建 measured。https://github.com/xyflow/xyflow/blob/main/examples/react/src/examples/ControlledUncontrolled/index.tsx 的 useNodesState/onNodesChange 形成受控闭环。领域已拥有明确尺寸时，适配层应按框架字段投影并验证 handle 测量。

本仓媒体统一入口（electron/shared/contracts/mediaImportPolicy.ts）回答展示面可接哪些媒体，却被 localFileImport 当成项目存储全集；assetTypes.ts 明确只展示四类媒体。因此不能加一个 text 成员后宣称完整支持。

独立只读反方代理 /root/adversarial_plan 审查了真实代码与失败报告：支持上述判断，另指出 importer 的全局 activeProjectId 与 surface 单槽 owner 风险。后续实现需保留完整项目身份及窗口隔离；错误处理覆盖所有读写 handler，main 白名单也需同源。

## 自媒体来源

本次未用 TikHub：问题已由真实 Electron 对照与框架安装版本源代码定位，属于具体内部契约修复；未将自媒体观点作为行为证据。Context7 不可用，官方源码直接核对。
