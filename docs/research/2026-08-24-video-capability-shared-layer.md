# 视频模型共享能力层调研与设计结论

日期：2026-08-24

## 结论先说

当前的 `CameraControlStrategy` 不是足够通用的共享抽象，不能作为最终设计。

问题不在于枚举少了几个镜头动作，而在于它把三种不同层次的东西混成了一个字段：

1. 用户想表达的创作意图，例如“镜头慢慢推进”；
2. 模型接受这种意图的方式，例如提示词、参考视频、首尾帧或结构化控制字段；
3. 某个供应商请求里的具体字段，例如 `video.edit.controls.trajectory`。

真实模型并没有一个共同的“相机控制 API”。因此共享层不应暴露统一的 `native / prompt / orbit / path` 相机枚举，而应保存**有来源的能力事实**，再由推荐器根据用户当前输入选择可用的表达通道。

## 真实文档对照

| 模型/接口 | 官方文档确认的输入或控制 | “镜头”实际如何表达 | 共享层能抽取什么 | 不能抽成什么 |
|---|---|---|---|---|
| Seedance 2.0 / APIMart | `image_urls`、带 `role` 的 `image_with_roles`、`video_urls`、`audio_urls`；首尾帧与参考视频/音频有互斥和依赖 | 文档示例把镜头调度写入 prompt；参考视频是多模态参考，不是一个 `camera` 参数 | 有角色的素材槽、数量/互斥/依赖、提示词可表达的意图、参考视频通道 | 不能声称存在 `orbit/pan/trajectory` 原生枚举 |
| Seedance 2.5 / APIMart | 当前仓库档案记录了图/视频/音频参考、首尾帧、时长/比例/清晰度差异；2.5 与 2.0 的音频依赖不同 | 仍是 prompt + 多模态参考；不同任务对 `adaptive` 等参数有约束 | 模式级输入角色、依赖、互斥、参数约束、来源和核验时间 | 不能把 2.0 的依赖或 2.0 的字段直接复制给 2.5；2.5 页面本轮抓取返回 404，正式落库前必须重新核验 |
| Veo 3.1 / Google | 支持 text-to-video、image-to-video、first/last frame；部分预览模型支持最多 3 张 subject reference；参数包含比例、时长、分辨率、seed 等 | Google 的生成示例通过 prompt 描述动作；API 没有统一的 camera-motion 参数 | 首帧/尾帧/subject/style 参考角色、模式支持矩阵、参数范围 | 不能把“支持首尾帧”误写成“支持相机轨迹控制” |
| Runway Gen-4/4.5 | image-to-video 的输入图是首帧；官方提示词指南明确要求 prompt 描述 subject motion、camera work、temporal progression；API image-to-video 请求核心是 `promptImage + promptText` | 相机运动由自然语言 prompt 表达 | prompt 作用域、首帧角色、模型/时长约束 | 不能假设 API 有独立的 pan/tilt/orbit 字段 |
| Luma Ray 3.2 | `video.edit.controls` 有 depth、face、normals、pose、trajectory；另有任意位置 `keyframes`、首尾帧、video reframe | `trajectory` 是视频编辑的运动轨迹条件；它不是“相机动作枚举”，且只在特定 `video_edit` 路径有效 | 结构化控制字段的真实路径、适用任务、参数 schema、关键帧位置约束 | 不能把 `trajectory` 直接映射成用户可选的“相机环绕/推拉” |
| Kling VIDEO 3.0 | 支持首尾帧、start frame + element reference、视频/元素参考、多镜头；官方示例用 prompt 描述跟拍、推拉、摇移等镜头语言 | 主要靠 prompt、首帧和元素/视频参考；多镜头是模型模式能力 | 输入角色、模式能力、prompt guidance、参考素材约束 | 不能把 Kling 的多镜头语义当成所有模型共有的 camera 参数 |

### 证据来源

- [APIMart Seedance 2.0 视频生成文档](https://docs.apimart.ai/cn/api-reference/videos/doubao-seedance-2-0/generation)：明确列出 `image_urls`、`image_with_roles`、`video_urls`、`audio_urls`，并写明首尾帧与视频/音频参考的互斥关系和音频依赖。
- [火山方舟 CreateContentsGenerationsTasks API](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)：确认 Seedance 2.0 的 `duration`、`ratio`、`generate_audio`、尾帧输出等真实字段，并给出带镜头调度的 prompt 示例。
- [Google Veo 首尾帧生成文档](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-first-and-last-frames)：确认首帧/尾帧是独立输入，prompt 仍负责描述动作和过渡，参数为比例、结果数、时长、清晰度等。
- [Google Veo 参考图引导文档](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/use-reference-images-to-guide-video-generation)：确认 subject/style reference 是独立参考类型，且不同模型版本支持范围不同。
- [Runway Image to Video Prompting Guide](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide)：明确 prompt 负责 subject action、environmental motion、camera motion、timing、direction、speed，输入图作为第一帧。
- [Runway Camera Terms](https://help.runwayml.com/hc/en-us/articles/47313504791059-Camera-Terms-Prompts-Examples)：明确 pan、角度、景别等作为 prompt 术语，而不是 API 统一结构化字段。
- [Luma Ray 3.2 Generations API](https://docs.agents.lumalabs.ai/api/typescript/resources/generations/)：确认 `trajectory`、pose、depth、normals 的真实字段、作用域和约束；也确认任意位置 keyframes 与首尾帧是不同控制面。
- [Kling VIDEO 3.0 官方用户指南](https://app.klingai.com/cn/quickstart/klingai-video-3-model-user-guide)：确认 start/end frames、element reference、多镜头和通过 prompt 描述镜头跟随/运动的真实能力。

### 顶尖开源工作流的交叉验证

开源工作流没有试图把所有模型压成一个“相机参数”也很有参考价值：

- [ComfyUI 官方 First-Last-Frame blueprint](https://github.com/Comfy-Org/ComfyUI/blob/master/blueprints/First-Last-Frame%20to%20Video.json) 把 `first_frame`、`last_frame`、`text`、`duration`、`fps`、`seed` 作为独立节点输入；这和“输入角色 + 参数事实”的拆分一致。
- [open-video skill](https://github.com/open-video-ai/open-video/blob/master/skill/open-video/SKILL.md) 要求在 prompt 中用 `<Picture 1>`、`<Video 1>`、`<Audio 1>` 明确素材角色，而不是把不同供应商的字段名混进创作意图；这支持保留有序、带角色的参考槽。
- [MiniMax H3 ComfyUI workflow guide](https://github.com/TheTerrasque/minimax-h3-frontend/blob/main/resources/COMFYUI_API_GUIDE.md) 将 t2v、i2v、first/last、reference-to-video 分成不同工作流，并按工作流列出可接的 `ref_image_N`、`ref_video_N`、`ref_audio_N`；这说明模式作用域和槽位约束应是能力事实的一部分。

## 共享层应该保存什么

共享层只保存四类稳定原语，全部按 `provider + model + version + mode` 作用域声明：

### 1. 输入角色（Input roles）

例如 `first_frame`、`last_frame`、`reference_image`、`reference_video`、`reference_audio`、`source_video`。

每个角色附带真实约束：数量、媒体类型、是否有序、是否允许和其他角色同时出现、是否存在 `requiresAnyOf`、实际请求字段/序列化方式。

这正是“有参考图时优先参考模式”的可靠基础，因为系统知道用户给的素材在该模式里究竟是什么角色，而不是看字段名猜。

### 2. 参数事实（Parameter facts）

保存真实字段的类型、枚举、默认值、范围、模式/变体限制和冲突关系。`adaptive`、2.0/2.5 音频依赖、首尾帧的比例限制，都属于这里。

### 3. 表达通道（Expression channels）

不再用 `cameraControl`，改成模式级的通道声明。通道只回答“用户意图可以通过哪种真实入口表达”，不伪造一个跨模型参数：

```ts
type ExpressionChannel = {
  signal: string; // 例如 camera_motion、subject_motion、motion_reference、trajectory
  via: "prompt" | "reference_slot" | "structured_parameter";
  status: "documented" | "unsupported" | "unknown";
  slotKind?: ArchetypeReferenceSlotKind;
  parameterKey?: string;
  parameterPath?: string;
  evidence?: ArchetypeSource;
};
```

例子：

- Seedance：`camera_motion + prompt + documented`；`motion_reference + reference_slot(video_ref) + documented`。
- Runway：`camera_motion + prompt + documented`；图像输入是首帧，不额外声称有相机字段。
- Luma `video_edit`：`trajectory + structured_parameter + documented + parameterPath=video.edit.controls.trajectory`；这不被命名为 `camera_motion`。
- 资料没有写清楚的地方是 `unknown`，只有官方明确写“不支持”才是 `unsupported`。

这样 UI 可以根据真实通道做最简展示：

- 有 prompt 通道：给用户自然语言运镜提示或少量快捷词，快捷词最终仍写入 prompt；
- 有 reference-video 通道：显示“加入运镜/动作参考视频”；
- 有 structured parameter 通道：只在适用模式显示该模型真实的高级控制；
- 没有证据：不显示假控件，也不向用户保证效果。

### 4. 证据与不确定性

每个事实都要带官方来源、核验时间、作用范围和状态。缺失资料不能自动变成“不支持”，否则新模型刚接入时会被错误隐藏。

## 明确不共享的东西

- provider 的字段名、鉴权、请求体位置和特殊字符串；
- 某个模型的 `trajectory`、`camera_path`、`generation_type` 等原生字段；
- 模型之间看似相同但语义不同的 `reference`：有的代表首帧，有的代表角色，有的代表风格，有的代表编辑源视频；
- “角色图一定优于文本”“有视频就一定选 omni”这类推荐结论。它们由上下文评分器根据候选事实、用户目标和当前素材动态产生，不写进能力档案。

## 对用户体验的直接影响

用户不会看到一套对所有模型都强行存在的“相机控制面板”。他只会看到当前模型真的能用的最短路径：

| 用户动作 | Nomi 的行为 | 用户价值 |
|---|---|---|
| 输入“镜头缓慢推进” | 对有文档依据的模型保留 prompt 语义；不凭空添加轨迹参数 | 少填一层表单，且不会误以为是精确轨迹控制 |
| 上传角色图 | 仅推荐声明了角色/参考图槽的模式，并保留角色语义 | 角色一致性更有依据，不会把图误当首帧 |
| 上传首帧+尾帧 | 仅推荐声明两种 frame 角色且满足互斥/比例约束的模式 | 不会生成到一半才发现参数冲突 |
| 上传运镜参考视频 | 仅在模型声明 `reference_video` 且该模式可用时推荐 | 参考视频不会被静默丢弃，也不会被误报成原生相机控制 |
| 切换供应商/模型 | 重新读取新档案的通道和约束，保留用户意图，重算可用表达方式 | 用户能自由换模型，不必学习 Nomi 的内部格式 |

## 研究后的实现决定

1. 删除最终设计中的 `CameraControlStrategy` 和 `nativeIntents`；它们只能保留在历史测试提交中，不能继续扩展。
2. 在共享能力注册表中加入模式级 `expressionChannels`，与现有 `slots`、`params`、`fixedParams` 并列。
3. 推荐器只依赖结构化能力事实和用户上下文；它不按供应商/模型名分支，也不把通道事实升级成执行参数。
4. 先把 Seedance 2.0、Seedance 2.5、Veo、Runway、Luma、Kling 的事实档案逐项补齐，再接 MCP 默认 wiring；Electron 和 renderer 只读同一份共享 registry，禁止复制一套 APIMart 档案。
5. 2.5 的 APIMart 页面本轮抓取返回 404。当前仓库已有来源记录，但在把它作为共享注册表的生产事实前，必须重新打开可访问的官方原文或通过实际 APIMart schema 重新核验；在此之前状态保持 `unknown`，不扩大承诺。

6. 默认候选不再写死一份“我们以为供应商有的模型列表”。Electron/stdio 启动时从用户当前模型目录读取视频模型：命中已对账档案才使用精确模式、槽位和参数；目录里出现但尚未对账的模型会生成保守的 `unknown` 档案，只提供文生/单图两条可证明的基础入口，不凭空提供首尾帧、全能参考或原生运镜。这样模型缺少某个高级能力时不会把整项视频能力关掉，供应商新增模型也不需要改推荐器。

本轮官方 APIMart 视频目录能检索到 `doubao-seedance-2-0`，但没有可访问的 Seedance 2.5 详细页面；因此 2.5 档案保留给明确出现在用户目录的模型，不能作为默认推荐候选。

## 验收标准

- 能用来源证明每个表达通道，而不是用枚举名称证明；
- Seedance 2.0、2.5 的输入角色和音频依赖不会互相串用；
- Luma 的 `trajectory` 不会被显示成跨模型“相机轨迹”控件；
- 缺失证据时推荐器不会声称“不支持”；明确不支持时才给出限制；
- 切换模型/供应商/参考素材后，推荐、参数约束和下一步会随新档案重算；
- 整个 planning/preview 阶段 provider、spend、Canvas、Timeline 计数仍为 0。
