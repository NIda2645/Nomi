# Nomi MCP 宣传片生成旅程问题复盘

日期：2026-08-27

审计对象：《Nomi v0.21.0｜最后一卷片》四段 Seedance 2.0 生成、时间轴编排、标题迭代与 MP4 导出

代码基线：`origin/main@8f9365aeb9dacc91153b186178eaf9184eeac639`

结论状态：**问题已定位，解决方案与执行顺序见配套设计和计划；本文件不宣称问题已经实现修复。**

关联文档：

- 设计：[`docs/superpowers/specs/2026-08-27-mcp-generation-control-plane-journey-design.md`](../superpowers/specs/2026-08-27-mcp-generation-control-plane-journey-design.md)
- 执行：[`docs/superpowers/plans/2026-08-27-mcp-generation-control-plane-journey-plan.md`](../superpowers/plans/2026-08-27-mcp-generation-control-plane-journey-plan.md)
- 既有架构：[`docs/superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md`](../superpowers/specs/2026-08-22-unified-runtime-mcp-generation-design.md)

## 一句话判断

这次不是“模型不会生成”，而是实际旅程仍走了 legacy `nomi_generate`，没有进入仓库里已经存在的 ProductionRun/GenerationOperation 语义路径；已有控制面地基也尚未贯穿媒体确认、宿主 UI、Canvas 和导出。四条视频都一次提交成功，成片质量依靠强参考、人工判断和反复导出做出来；用户体验却被确认入口、媒体预览、参数切换、状态真相、标题编辑和导出回溯割裂。

换句话说：**内容生成成功了，产品闭环没有成功。**

## 1. 用户真正经历了什么

理想路径应是：

```text
描述意图
→ 看见将使用的模型、参数、参考素材和花费
→ 在当前界面确认一次
→ 任务进入后台并得到可恢复的 operationId
→ 在 MCP 或 Nomi 任一端看同一份进度和结果
→ 一键加入时间轴、加章节标题、导出并可回看
```

实际路径是：

```text
MCP 批量建节点被取消但不告诉原因
→ 拆成单节点重做
→ MCP 触发付费生成，却无法在当前客户端完成确认
→ 切回 Nomi，用电脑控制找确认卡并点击
→ 确认时只知道“有参考素材”，看不到具体图片/视频
→ 选择 APIMart/模型后，1080p/12–13s 被默认值覆盖
→ 重新设置参数，再提交
→ MCP、节点和供应商各自显示状态，无法确信哪一个是真相
→ 结果视频在 MCP 面板里没有可用画面预览
→ 用 Nomi 预览、手动加入时间轴
→ 标题先做成底部字幕，用户指出叙事意图不清
→ 改成居中章节卡并连续导出四版
→ 另用 ffprobe、抽帧和音轨检查确认最终质量
```

用户的感受不会是“系统有几个小 bug”，而是：

> 我已经把创作意图交给 Nomi 了，但每到关键一步都要猜：在哪里确认、批准的到底是哪一组素材、参数有没有被改、任务还在不在跑、结果在哪里、导出是不是我看到的那一版。

## 2. 证据等级与回溯方式

为避免把记忆、推断和代码事实混成一团，本复盘使用四类证据：

| 等级 | 含义 | 本次载体 |
|---|---|---|
| E1 | 落盘运行事实 | `.nomi/events/log-0.jsonl`、runId、事件序号、供应商完成状态 |
| E2 | 落盘媒体/导出事实 | `.nomi/jobs/*`、`ffmpeg.log`、`result.json`、最终 MP4、contact sheet |
| E3 | 真实旅程观察 | 本次 MCP 调用、Nomi 电脑操作、确认、预览、时间轴和导出的完整操作轨迹 |
| E4 | 当前代码根因 | `electron/capabilityCore`、生成画布、时间轴、导出管线的具体入口 |

本地项目证据根目录：

```text
/Users/aoqimin/Documents/Nomi Projects/Nomi v0.21.0｜最后一卷片-mtb67t42-182d6835
```

核心文件：

```text
.nomi/events/log-0.jsonl
.nomi/project.json
.nomi/jobs/<jobId>/job.json
.nomi/jobs/<jobId>/manifest.json
.nomi/jobs/<jobId>/ffmpeg.log
exports/nomi-export-202608271734.mp4
```

可视化交付：

```text
/Users/aoqimin/Desktop/Nomi-v021-launch-media/videos/nomi-v021-story-film/renders/nomi-v021-story-film-final.mp4
/Users/aoqimin/Desktop/Nomi-v021-launch-media/videos/nomi-v021-story-film/renders/nomi-v021-story-film-contact-sheet.jpg
```

## 3. 完整轨迹与卡点

| 阶段 | 用户想做什么 | 实际发生 | 用户为什么难受 | 证据 |
|---|---|---|---|---|
| 规划 | 一次建立四个视频节点 | `nomi_add_nodes` 批量请求返回 `ids:[]、cancelled:true`，未返回拒绝、超时或入口信息；拆开后可建 | 用户不知道是内容错、权限错还是该去 Nomi 点一下，只能盲拆重试 | E3；`mcpProtocol.ts:510-540`、`core.ts:296-309` |
| 配置 | 把 1080p、12–13s 和多参考绑定到节点 | 批量建节点 schema 只有 prompt/vendor/model，没有生成参数和媒体角色；`nomi_generate` 才有部分参数 | “节点已经配置好”和“真正发给模型的参数”不是一回事 | E3；`mcpToolCatalog.ts:50-82,391-444` |
| 付费确认 | 在 MCP 当前界面看清输入后确认一次 | 两次 MCP 生成因当前 host 无法完成付费确认而取消，未消耗额度；之后切到 Nomi 点击 | 安全是对的，但用户被迫在两个应用间找一张不知道长什么样的卡 | E3；`mcpProtocol.ts:563-629` |
| 输入核对 | 确认批准的是这几张图和这段视频 | 确认合同只带 `referenceCount`，不带媒体预览或角色；应用内卡也只显示数量 | 多参考任务最怕“选错人/选错上一镜”，数量不能回答“是哪几个” | E3/E4；`mcpGateConfirmation.ts`、`appIntegration.ts`、`capabilityApplyHandler.ts` |
| 模型切换 | 切到 APIMart Seedance 2.0 | APIMart 本身可用，四次都成功；但切模型会删旧控件值并应用新默认，1080p/12–13s 回到 720p/5s | 用户以为只换渠道，实际创作合同被静默改了 | E1/E3/E4；`buildNodeModelChangePatch.ts:47-71` |
| 等待 | 知道还需多久、是否仍在跑 | UI 提示“约 1 分钟”，真实耗时 8:05、8:58、16:59、13:55；MCP、节点、供应商状态存在短时不同步观察 | 用户会把长等待误判成卡死，或把某个局部完成误判成最终完成 | E1/E3/E4；`spendConfirm.ts:190-198`、`core.ts:380-383,593-633` |
| 结果 | 在原 MCP 客户端直接看到视频 | MCP Apps 结果面板要等工具返回后才出现；视频没有 poster 时不抽帧，widget 又把 `thumbnailUrl` 统一放进 `<img>` | 用户得到“成功”文字，却没有一眼可判断的视频内容 | E3/E4；`mcpPreviewImage.ts:50-76`、`mcpAppWidget.ts:215-263,441-447` |
| 预览 | 在 Nomi 看成片 | 全屏预览曾短暂出现“无法播放媒体”，缓冲后可播 | 在长任务后第一眼看到播放错误，用户会怀疑结果坏了 | E3；需补播放器 phase telemetry，当前不把根因写死 |
| 编排 | 把四段接到时间轴 | “已加入时间轴末尾”反馈清楚，多段插入成功 | 这是正向样本：动作结果明确、位置明确 | E3 |
| 标题 | 用章节卡说明核心更新 | 首版标题落在底部，用户看不懂叙事结构；标题时长/位置/缩放靠手动，自动化难以精确选中已有文字 | 标题不是装饰，而是把故事和产品迭代连接起来；当前系统只提供静态预设 | E3/E4；`timelineTextEdit.ts`、`textLayout.ts`、`TimelinePreview.tsx` |
| 导出 | 得到最终 MP4 并能确认是哪一版 | 先后导出 4 次；toast 有相对路径和“在文件夹中显示”，但结果不是持久的项目内 Artifact 卡 | 成功反馈会消失，之后只能翻目录和 job 记录找版本 | E2/E3/E4；`TimelinePreview.tsx:254-285` |
| 回溯 | 重启后复演这次成功导出 | 实际 ffmpeg 使用 4 段视频/音频和 7 张文字 PNG；持久化 job manifest 却记为 0 轨道、`audioCodec:none`、`audioMode:mute` | 系统保存了一份“成功，但原因是假的”历史，无法可靠再次导出或定位差异 | E2/E4；`exportJobs.ts:198-219`、`exportJobManager.ts:120-135` |

## 4. 生成本身的事实：APIMart 没有被预检卡住

四次付费生成都只提交一次，全部成功，没有因“扣费前验证”挡住 APIMart：

| 镜头节点 | runId | requested → completed | 耗时 | 结果 |
|---|---|---:|---:|---|
| `node-618b0167-2` | `task_01M110SH6JP27HYAWDY828J0WT` | seq 27 → 28 | 8m05s | succeeded，1 asset |
| `node-3fdb65a4-3` | `task_01M112J4TVHBNQGEVRHQ7F1ECZ` | seq 58 → 59 | 8m58s | succeeded，1 asset |
| `node-82d83d07-4` | `task_01M11436RWH5ZDQCVGK3XVJK8C` | seq 85 → 86 | 16m59s | succeeded，1 asset |
| `node-d74b4289-5` | `task_01M115YK73AWPJDPPTPFT6VQ9K` | seq 111 → 112 | 13m55s | succeeded，1 asset |

“素材、能力和 CLI 身份在扣费前验证”和“错误请求不先消耗额度”不是给正常 APIMart 加一道额外门。它们只在请求已经不可能执行或身份不可信时提前拒绝；合法 APIMart 走正常 catalog/runtime，不走 Antigravity CLI 的专用身份闸。本次四个真实结果证明合法链路未被这套保护误伤。

## 5. 最终成片为什么有现在的质量

### 5.1 好的部分从哪里来

最终成片不是靠碰运气：

- 四段视频均一次生成成功，没有“挑十条留一条”掩盖稳定性；
- 后三段使用上一段视频和角色/风格图做连续性锚，身份、胶片卷轴和影院空间得以延续；
- 每段保留 Seedance 原生音频，最终导出确实包含 AAC 立体声音轨；
- 人工检查了过渡帧、黑帧、音频和最终 contact sheet；
- 用户对“底部字幕看不懂”给出明确修正后，标题改为故事节拍中的居中章节卡。

最终文件实测：H.264、1920×1080、30fps、50.4s、AAC stereo 32kHz、31,425,266 bytes。

### 5.2 不够好的部分从哪里来

质量不是由一条闭环自动保证，而是靠人工绕过控制面缺口补出来：

```text
MCP 不展示确认素材
→ 人工回 Nomi 核对
→ 参数切换会重置
→ 人工重新设置
→ 视频结果在 MCP 不可视
→ 人工回 Nomi 预览
→ 标题没有语义化章节节拍
→ 人工删改重做
→ 导出结果不可持久回看
→ 连续导出 4 版 + 外部 ffprobe/抽帧确认
```

四次导出反映的不是 ffmpeg 不稳定，而是标题和结果确认没有形成编辑闭环：

| jobId | 时间 | 标题数量 | 结果 |
|---|---:|---:|---|
| `52edb752-285f-4f39-9ac2-7a3df4f48ded` | 17:07 | 2 | 初版 |
| `e282e0da-e2a4-424a-b676-b8c5c876417c` | 17:17 | 4 | 增补章节信息 |
| `33c69011-c6e3-496b-99e4-4df3d73bf4c2` | 17:30 | 7 | 完整章节卡 |
| `457196f8-0e27-4f02-b871-b6e2555d5166` | 17:34 | 7 | 最终微调版 |

最终七个标题是：`09:00 FINAL`、`COMFYUI / 多模态工作流`、`WAN 3.0`、`MINIMAX H3`、`火山引擎`、`GEMINI`、`一个人，也有一整间片场 / Nomi v0.21.0`。

因此最终质量的准确评价是：

> 模型与参考策略提供了不错的故事素材；Nomi 还没有把“确认—等待—看片—章节叙事—导出验收”变成同一条产品路径。成片质量达标，但达标过程不可规模化，也不可稳定复演。

## 6. 根因不是一个弹窗，而是 legacy 路径绕开了已有 Operation 地基

当前代码并非“完全没有 operation”：

- `mcpGenerationTools.ts` 已定义 `nomi_operation_create → submit_generation_plan → preview_execution → request/decide gate → start_generation → operation_read`；
- `productionGenerationOperationStore.ts` 已把语义 operation 适配到 ProductionRun，没有新建第二个持久 owner；
- `generationDispatcher.ts` 已绑定 lease、receipt、contract 和 start/reconcile；
- `productionRunService.ts:655-705` 已为 semantic single-shot 保留独立恢复路径。

这是应该保留并完成的正确地基。问题是本次真实旅程仍由工具目录中的 legacy `nomi_generate` 执行；同时语义路径的 `nomi_request_generation_gate` 又在 `mcpProtocol.ts:631-638` 内被合并成“请求 challenge → 阻塞确认 → decide → start”的一次调用，MCP App 资源映射也没有覆盖 operation create/preview/gate/read。结果是**代码里有 durable owner，用户所在的路径却没有得到它的好处**。

旅程中仍表现出至少五个割裂投影：

本次实际旅程至少暴露了五个没有统一读自 ProductionRun operation 的投影：

1. MCP `tools/call` 的等待、进度和最终 result；
2. Canvas 节点的 `queued/running/error/result`；
3. Electron runtime 的 task cache 和供应商轮询；
4. 项目事件账本的 vendor requested/completed；
5. 导出 job 的 manifest、内存 prepared plan 和最终文件。

它们分别在局部做了正确的事；ProductionRun 已经可以成为答案，但 legacy 工具、确认合并流、Canvas 状态和 export job 还没有全部只读它的 projection。用户问“这一条生成现在到底怎样”时，实际使用的表面仍给不出同一个跨界答案。

### 6.1 确认面为什么没有图和视频

- `mcpProtocol.ts:236-265` 使用 MCP form elicitation 的 flat boolean schema；它只能承载标题和描述，不能承载 Nomi 的多媒体确认卡。
- `mcpGateConfirmation.ts` 的 challenge 有模型、参考数量和成本，没有媒体 manifest。
- `appIntegration.ts` 与 `capabilityApplyHandler.ts` 继续只投影 `referenceCount`。
- MCP Apps widget 绑定在工具结果上；付费确认发生在工具完成前，当前协议中没有标准化的“把 App 挂到 elicitation 并阻塞等待”的能力。

所以这不是把 `<img>` 塞进旧 boolean 弹窗就能解决的问题。确认必须从长调用中拆出来，先落一个可恢复 operation，再让任意支持的表面审阅同一份 revision。

### 6.2 长任务为什么把 MCP 调用本身吊住

`core.ts:380-383` 明确说明 task cache 在进程内，host 退出即丢，因此当前 `nomi_generate` 必须在同一次调用中轮询到终态。`core.ts:593-633` 最长可以等待 15 分钟。

这能避免某些结果丢失，但代价是：

- 客户端超时、关闭或重连没有稳定句柄；
- 确认、提交、等待、结果全挤在一次 RPC；
- MCP Apps 只能在结果回来后才展示；
- 状态很难与 Nomi 节点、事件账本收敛。

### 6.3 模型切换为什么重置参数

`buildNodeModelChangePatch.ts:47-71` 先移除旧模型 controls，再应用新模型 defaults。这对“不兼容参数不能遗留”是合理的，但缺少三件事：

- 兼容字段保留；
- 不兼容字段的可见 diff；
- 变更后重新批准的 revision。

结果就是正确的 schema 清理机制表现成了“静默改坏用户设置”。

### 6.4 视频结果为什么在 MCP 没画面

`mcpPreviewImage.ts:50-76` 明确规定视频没有现成 poster 就不抽帧；`mcpAppWidget.ts:441-447` 又把所有 `thumbnailUrl` 用 `<img>` 渲染。于是：

- 有视频 URL 不等于有图像 poster；
- 把 MP4 URL 塞进 `<img>` 也不会变成视频预览；
- 当前结果面板只能显示“视频”占位或加载失败。

### 6.5 为什么 ETA 完全不可信

`spendConfirm.ts:193-198` 使用静态常数：视频每条 40 秒，并四舍五入到分钟。本次真实数据为 8–17 分钟，误差达到一个数量级。这个提示不是“粗略”，而是在错误地塑造用户预期。

### 6.6 为什么导出历史与最终文件矛盾

`renderManifest.ts:171-195` 先建立 renderer manifest；`exportJobs.ts:140-192` 在主进程解析本地资产、探测音轨并生成真正的 filtergraph manifest；但 `exportJobs.ts:205-219` 先把原始 manifest 交给 `exportJobManager.createJob` 持久化，只把 prepared manifest/plan 放在内存 map。`exportJobManager.ts:120-135` 因而保存了旧快照。

最终 ffmpeg 用的是真 manifest，重启后看到的是假 manifest。这不是显示问题，而是作业事实持久化顺序错误。

## 7. 哪些东西是好的，不能在重构时丢掉

- 付费前确实要求真人确认；两次取消都没有消耗额度。
- 每个合法 APIMart 任务只提交一次，没有确认重放导致重复扣费。
- “已提交厂商，无法中止（费用已产生）”如实区分可撤回与不可撤回阶段。
- `nomi_read_canvas` 能持续读回长任务状态。
- 项目事件账本记录 vendor requested/completed 和技术审片结果。
- 多参考连续性输入有效，后续镜头能够继承上一镜空间和角色。
- “已加入时间轴末尾”是清楚、低摩擦的动作反馈。
- 导出主路径最终生成正确 MP4，且已有“在文件夹中显示”的动作意图。

解决方案必须保留这些业务护栏和本地优先资产，不应该为了采用通用框架而换掉它们。

## 8. 严重度与修复优先级

| 优先级 | 问题 | 用户后果 | 放行条件 |
|---|---|---|---|
| P0 | 已有 GenerationOperation 未成为默认路径，且未贯穿 Canvas/export | 确认、等待、结果跨端断裂，legacy host 退出可能丢状态 | 任一表面可用 operationId 重读同一快照/事件/结果 |
| P0 | 导出持久 manifest 与实际执行不一致 | 无法可信再次导出和审计成功原因 | job 落盘的 resolved manifest 与 ffmpeg 输入、音轨、overlay 一致 |
| P1 | 确认卡不展示实际媒体及角色 | 多参考任务可能批错输入 | 确认前可见 poster/缩略图、角色、模型、参数、成本和 revision diff |
| P1 | 模型切换静默覆盖兼容参数 | 成片时长/分辨率偏离意图 | 保留兼容值；不兼容变化必须显式 diff 并生成新 revision |
| P1 | 视频无 poster，结果 widget 使用错误媒体元素 | 成功后仍无法判断内容 | 每条视频有 poster；App 使用 video/poster 语义而非 MP4-in-img |
| P1 | 固定 40 秒 ETA | 等待被误判为卡死 | 使用 provider/model 历史分位数；样本不足就明确“不确定” |
| P1 | 取消只返回 `cancelled:true` | 用户无法恢复，只能重试 | typed reason + nextAction + operationId/challengeId |
| P2 | 标题只是一组静态预设和手动变换 | 产品更新无法自然进入故事节拍 | chapter-title beat 可由语义命令创建、自动适配安全区并可预览 |
| P2 | 导出结果只靠瞬时 toast/目录 | 版本难找、难比较 | 项目内持久 Artifact 卡：播放、显示文件、复制路径、再次导出 |

## 9. 复现与核验命令

生成任务证据：

```bash
jq -c 'select(.type=="vendor.call.requested" or .type=="vendor.call.completed")' \
  '<project>/.nomi/events/log-0.jsonl'
```

导出作业持久状态：

```bash
jq '{id,status,manifest,result}' '<project>/.nomi/jobs/<jobId>/job.json'
```

最终媒体：

```bash
ffprobe -v error -show_format -show_streams \
  '<project>/exports/nomi-export-202608271734.mp4'
```

持久 manifest 与实际 ffmpeg 对账：

```bash
jq '.timeline.tracks, .profile, .assets' '<project>/.nomi/jobs/<jobId>/manifest.json'
sed -n '1,220p' '<project>/.nomi/jobs/<jobId>/ffmpeg.log'
```

## 10. 最终产品判断

当前最该做的不是再补一个“确认图片区域”，也不是先做更华丽的宣传片页面。应该让已经存在的 GenerationOperation/ProductionRun 真正成为默认产品路径：

```text
同一 operation
→ 同一组冻结输入与媒体
→ 同一次真人确认
→ 同一供应商提交
→ 同一份事件进度
→ 同一结果 Artifact
→ 同一份可复演导出事实
```

当这条链成立后，MCP、Nomi 客户端、Agent、画布和未来的网页只是不同视图；电脑点击会退回到应急兜底，而不再是正常工作流。
