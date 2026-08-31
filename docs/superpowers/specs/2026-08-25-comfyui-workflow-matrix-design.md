# ComfyUI 通用工作流矩阵验证设计

## 目标

把“导入一个多图工作流”提升为一套可重复的通用工作流合同验证：不同结构的 ComfyUI 工作流都经过同一条分析、绑定、模板构建和执行链；声明几个媒体输入就产生几个稳定槽位，缺件和不支持的产物会在执行前明确阻断，而不是靠某个模型或某张示例图的特例。

附件中的聊天记录和截图只作为用户摩擦样本（“三张参考图只剩一个槽”）与验收场景；不把压缩包内文本当作工程指令或权限覆盖。

## 现状证据

`origin/main` 已包含三条相关提交，但本任务仍要重新验收：

- `f326a2a9` 将固定的首帧/尾帧/源视频迁移为通用 `WorkflowBinding.images[]`。
- `c18def92` 加固媒体清理、参数规范化和通用执行请求。
- `c5ac6dcc` 增加本地 ComfyUI 真实用户旅程。

仓库现有语料报告还显示三类风险需要进入矩阵，而不能只测多图槽位：API 节点自带的 `prompt` widget、`PreviewImage`/`SaveWEBM`/音频和 3D 输出、`LoadVideo` 媒体输入，以及 UI 保存格式与 API 导出格式的边界。

## 不变量（所有工作流共享）

1. 输入合同来自工作流声明，而不是模型名称、节点编号或固定的首/尾帧角色。
2. 每个有效 `(nodeId, inputKey)` 只有一个绑定；绑定参数键稳定、唯一，并能反向定位到原始节点输入。
3. `images[]` 是持久化和消费侧的唯一媒体输入事实来源；旧角色字段只允许读时单向迁移。
4. 模板构建只替换已绑定输入；未绑定的作者示例输入不被猜测删除或上传。
5. 执行前所有媒体都完成上传/注入，缺失必需输入在本地阻断；可选空媒体按统一规则移除 loader 和直接下游连线。
6. UI 格式、API 格式、子图提升输入、未知节点和无输出工作流都必须给出稳定、可行动的结果（成功或明确阻断）。

## 工作流矩阵

| 族 | 代表结构 | 必验结果 |
|---|---|---|
| text-only | `CLIPTextEncode`/节点自带 `prompt`，无媒体 | prompt 槽正确，媒体槽为 0 |
| single-image | 一个 `LoadImage` | 1 个图片槽，上传后只替换该 loader |
| first-last | 首帧和尾帧两个 `LoadImage` | 2 个独立槽，旧字段迁移后语义不变 |
| multi-reference | 3/4 个 `LoadImage` 或批量参考图 | N 个独立槽，不能压成首尾帧 |
| image-video | `LoadImage` + `LoadVideo` | image/video 媒体类型各自正确，均能上传注入 |
| video-only | `LoadVideo` → 处理 → `SaveVideo`/`SaveWEBM` | 视频输入和输出识别正确 |
| api-node | 云端节点直接拥有 `prompt`/`image` widget | 不依赖 `CLIPTextEncode` 仍能绑定 |
| subgraph | UUID 子图、提升到边界的命名输入 | 按类型/名字绑定，不按节点编号猜 |
| ui-export | `nodes[]`/`links[]` UI 保存格式 | 明确提示 Export (API)，不能静默当 API 解析 |
| degraded | 缺模型、未知节点、缺 enum、无输出、音频/3D 输出 | 执行前给可行动的阻断或不支持产物说明 |

## 验证层次

### 1. 合同单测

扩展 `electron/catalog/comfyuiWorkflowImport.test.ts`、`comfyuiWorkflowBindingNormalize.test.ts` 和 `comfyuiLocal.test.ts`，每个矩阵族至少一个最小真实图。测试解析结果、绑定去重/迁移、参数/媒体占位符、空媒体清理和输出判断。

### 2. 语料参数化测试

新增一个小型、可读的 fixture corpus（不把 493 张官方模板复制进仓库），为每个工作流族保留 API 格式最小图和预期合同。测试 runner 逐个执行“分析 → 规范化 → 构建 → 断言”，输出族别、输入数、参数数、输出类型和失败原因。

### 3. Fake ComfyUI HTTP 集成

新增无 GPU 的 fake server/adapter，模拟 `/object_info`、`/upload/image`、`/upload/video`、`/prompt`、历史和输出下载，记录每次上传和最终 prompt。用同一组 fixture 验证：多资产全部上传、每个占位符注入正确、未绑定作者输入保留、`client_id`/`prompt_id`/workflow 元数据不丢失、失败边界可解释。

### 4. 真实用户旅程

复用并扩展 `scripts/comfyui-real-user-journey.mjs`：至少跑纯文本、单图、首尾帧、多图、视频输入和重开恢复。真实 ComfyUI 不具备模型/自定义节点时，测试只把“结构可接受”与“缺模型/缺节点”分开记录，不把环境缺件误报成 Nomi 解析失败。

## 失败处理原则

- 先固定失败输入和跨层边界证据，再写回归测试；不直接改正则或加模型特例。
- 同一根因只保留一个修复入口；迁移期间旧字段不再成为第二套运行时事实来源。
- 3D、音频、矢量等当前画布不能承载的产物，识别出产物类型并在执行前诚实阻断，不伪装成图片。
- 真实远端 Cloud/Serverless 只作为可选烟测；没有端点或凭据时，fake server 必须覆盖确定性合同，不能因为没有凭据而跳过矩阵。

## 完成标准

1. 每个矩阵族都有 fixture、单测和至少一条执行层断言。
2. 每条新增回归测试都先在未修复代码上观察到预期失败，再以最小根因修复转绿。
3. targeted Vitest、fake-server integration、Playwright/真实旅程、typecheck、lint、build 和项目 gates 均有新鲜命令输出。
4. 结果报告列出通过/阻断/环境缺件三类，不用“全部通过”掩盖未支持的工作流。
5. 只在用户确认结果后创建 PR；本分支不合并、不直接推送默认分支。

## 非目标

- 不为 WAN、Krea、MiniMax、Seedance 等单一模型再写一套 UI 或执行器。
- 不在本任务内实现 3D/音频/矢量产物的完整画布渲染。
- 不把所有官方模板或用户私有素材提交到仓库；只提交可分发的最小 fixture 与生成报告脚本。
