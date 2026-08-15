# ComfyUI 通用接入核心加固

## 目标

在不引入任何模型专用判断的前提下，加固所有导入工作流共用的两条契约：

1. 请求提交前安全处理缺失的可选媒体输入，同时保留会话身份、checkpoint 补全和可复现元数据。
2. 用户保存的参数选择成为唯一事实来源；无效、重复或只存在于界面的绑定不能进入模型目录。

## 范围

- 导入时标记用户明确绑定的图片/视频输入槽。
- 模板渲染后清理缺少文件的标准媒体 loader、已标记 loader 及其直接下游连线。
- `comfyui-prompt` 在同一条管线中完成媒体清理、checkpoint 补全、`client_id`/`prompt_id` 封装。
- 规范化并持久化 `WorkflowBinding`：显式 `params: []` 优先、legacy `numeric` 单向迁移、目标/默认值校验、合法且唯一的 `paramKey`。
- 单元、HTTP 集成和现有真实用户旅程回归。

## 不动项

- 不加入 MiniMax H3、Qwen、WAN 或其他具体模型/工作流适配器。
- 不根据非空作者示例图片猜测并删除节点。
- 不改变工作流设置页和画布参数面板的视觉设计。
- 不改变 ComfyUI 之外的供应商请求。
- 不承诺未知自定义 loader 的目录/path 语义；只有 Nomi 标记的槽或已知标准 loader 才进入清理。

## 设计

### 媒体槽所有权

导入绑定把对应节点写成模板占位时，在节点 `_meta.nomi_bound_media_input` 中记录输入键。该标记只表示“这个输入由 Nomi 本次请求负责填充”，不改变 ComfyUI 节点语义。

模板渲染后，如果该输入不存在、为 `null` 或空字符串，则删除 loader。对没有标记的节点，只处理类名和输入键都明确属于标准媒体 loader 的空节点；非空作者示例和未知社区 loader 保持不动。

### 请求顺序

1. 读取模板渲染后的 prompt。
2. 清理空媒体 loader 和直接引用它的输入连线。
3. 对剩余图补全空 checkpoint。
4. 在最终 body 上覆盖会话唯一 `client_id` 和调用层预生成的 `prompt_id`。
5. 其他顶层字段（尤其 `extra_data.extra_pnginfo.workflow`）原样保留。

### 参数契约

- `params` 只要是数组（包括空数组）即为用户的明确选择；仅当它不存在时读取 legacy `numeric`。
- 参数目标必须是原 API 图中真实存在的标量 widget，不能是连线或不存在的输入。
- 同一个 widget 只能承担一个角色；冲突时按提示词、首帧、尾帧、源视频的固定优先级保留一个并持久化清理后的结果。
- 角色输入不能同时成为动态参数。
- 每个 `(nodeId, inputKey)` 只保存一次，每个 `paramKey` 合法、唯一且位于 `comfy_` 命名空间，避免被 Nomi 的 `width`、`height`、`seed` 等标准请求字段覆盖。
- 规范化结果写回模型目录，完成 legacy 数据的单向迁移。

## 验收

- 缺失尾帧/视频/音频时，空 loader 和直接连线在 `/prompt` 前消失。
- 已填写媒体、未知社区 loader、非空作者示例保持不变。
- 媒体清理与 checkpoint 补全同时发生时均生效。
- 最终 body 同时保留唯一 `client_id`、预生成 `prompt_id` 和 `extra_pnginfo`。
- 显式空参数保存、关闭重开和重新落库后仍为空。
- 无效目标、重复目标、非法/重复 key 不产生 UI-only 参数。
- 现有普通 `workflow.json` / `workflow_api.json` 导入和真实 ComfyUI 旅程不回归。

## 回滚

改动集中在导入建图与 `comfyui-prompt` 请求变换。回滚提交后，已有目录数据仍可由旧逻辑读取；新增 `_meta` 字段会被 ComfyUI 当作普通节点元数据忽略。
