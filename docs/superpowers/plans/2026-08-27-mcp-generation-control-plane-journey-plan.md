# Nomi Generation Operation 控制面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: use `test-driven-development`, `executing-plans`, `requesting-code-review`, and `verification-before-completion`. 每个阶段必须先红后绿；用户可见阶段必须跑真实 Electron/MCP journey 并人工读截图/媒体。

**Goal:** 把一次生成从长时间阻塞的 `nomi_generate` 调用，迁成一个持久、可确认、可恢复、可观察、可导出回溯的 Generation Operation，同时保留现有 ProductionRun、Asset、Timeline、spend grant 和 provider runtime owner。

**Architecture:** `operationId` 是现有 ProductionRun/ExecutionContract/job/gate/artifact 的用户级一对一关联，不新建第二套数据库。MCP Apps、Tasks、Elicitation 和 plain tools 都是渐进适配器。先落 operation/revision 和 transport 退化路径，再修媒体、参数、状态、导出和标题语义。

**Baseline:** `origin/main@8f9365aeb9dacc91153b186178eaf9184eeac639`

**Problem evidence:** [`docs/audit/2026-08-27-mcp-generation-journey-incident-review.md`](../../audit/2026-08-27-mcp-generation-journey-incident-review.md)

**Design:** [`docs/superpowers/specs/2026-08-27-mcp-generation-control-plane-journey-design.md`](../specs/2026-08-27-mcp-generation-control-plane-journey-design.md)

## 0. 与现有计划的关系

本计划不是第二套 unified runtime 计划：

- ownership、ExecutionContract、ProductionRun、approval receipt、outbox、reconcile 继续以 2026-08-22 canonical 设计为准；
- 本计划新增的是本次真实旅程证明缺失的用户控制面、媒体确认、operation transport、导出事实和标题节拍；
- 与 2026-08-22 plan 重叠的基础模块不重复实现，只补测试与接线；
- legacy `nomi_generate` 在迁移期只做 adapter，不能继续拥有新的状态或授权语义。

## 1. 阶段总览与合并闸

| 阶段 | 交付 | 独立可合并条件 |
|---|---|---|
| P0 | 旅程观测和事实不变量 | 零额度 journey 能复现当前断点并产出 operation trace |
| P1 | durable Operation projection | 重启后 operationId 可恢复同一 Run/gate/job/artifact |
| P2 | prepare/approve/start transport | plain MCP host 不挂死；确认前零 spend/provider；legacy adapter 行为可控 |
| P3 | 富媒体确认和视频 poster | 确认卡/MCP App 展示真实媒体及角色；视频不再 MP4-in-img |
| P4 | 参数 revision/diff | 切模型不静默覆盖兼容值；变化使旧 receipt 失效 |
| P5 | 统一状态和 ETA | MCP/Canvas/任务中心同 cursor/phase；ETA 有数据或诚实未知 |
| P6 | 导出事实与 Artifact 卡 | persisted manifest 与实际 ffmpeg 逐字段对账 |
| P7 | 章节标题语义 | chapter beat 可创建、修改、预览、导出，无坐标点击 |
| P8 | 真实宣传片闭环 | 4 镜真实任务 + 重启 + 导出一次通过，人工读图/看片 |

禁止把 P3 的漂亮确认卡先合并成“完成”，如果 P1/P2 的 operation/恢复仍不存在。

---

## Task 1: 固化当前失败旅程与指标

**Files:**

- Modify: `tests/ux/_mcpJourney.mjs`
- Create: `tests/ux/mcp-generation-operation-journey.e2e.mjs`
- Create: `electron/capabilityCore/generationOperationTrace.test.ts`
- Modify: `package.json`
- Create: `docs/audit/<date>-mcp-generation-operation-evidence.md`

**Step 1: 写 RED journey**

用 mock slow-video provider 复现：

- `nomi_add_nodes` 拒绝只返回 `cancelled:true`，没有 reason/nextAction；
- 付费确认不支持时工具调用只能失败/等待，拿不到 durable operationId；
- host 断开再连接后无法从 `nomi_generate` 原调用恢复；
- 视频无 poster，MCP result 无可判断画面；
- Canvas 与 MCP status 不是同一个事件 cursor。

**Step 2: 记录基线指标**

每步写 JSONL：`operationId/runId/requestId/cursor/visibleAction/duration/retries/providerSubmitCount/spendCount/mediaBlocks/nextAction`。

**Step 3: 加真实项目 fixture**

基于四镜项目的参数形状做脱敏 fixture：4 个 video nodes、首镜 2 image refs、后续 continuity video + style refs、13s/1080p。

**Step 4: 运行并保存 RED**

```bash
pnpm run build
node tests/ux/mcp-generation-operation-journey.e2e.mjs
```

预期：针对 operation/恢复/视频 poster 的断言失败；现有付费硬闸与 raw provider submit=0 的安全断言通过。

---

## Task 2: 补全现有 GenerationOperation 投影，不建第二 owner

**Files:**

- Modify: `electron/productionRun/productionGenerationOperationStore.ts`
- Modify: `electron/productionRun/productionGenerationOperationStore.test.ts`
- Modify: `electron/capabilityCore/mcpGenerationTools.ts`
- Modify: `electron/productionRun/productionRunTypes.ts`
- Modify: `electron/productionRun/productionRunService.ts`
- Modify: `electron/productionRun/productionRunProjectionSanitizer.ts`
- Modify: `electron/productionRun/productionRunRepository.ts`
- Modify: `electron/productionRun/productionRunState.ts`

**Step 1: 写 RED reducer/projection tests**

覆盖：

- 一个 operationId 必须唯一绑定 `{project generation, runId, shotId, contractHash}`；
- snapshot + cursor 原子读取；
- gate/job/provider/artifact events 单调派生 phase；
- restart 后同 operationId 恢复；
- corrupt/stale snapshot 只读重建，不在 read 中偷偷写盘；
- `submission_unknown` 不得投影为 failed+retry 或 completed。

**Step 2: 实现纯 projection**

扩展现有 `createProductionGenerationOperationStore`，只读现有 Run/event/binding，不引入新的 `OperationStore`。operation index 若为性能需要，只能是可重建索引，owner 仍是 ProductionRun event log。

**Step 3: 加 migration fixture**

旧 Run 无 operationId 时，只有显式迁移/恢复命令可补确定性 ID；普通 read 不改文件。

**Step 4: 验证**

```bash
pnpm exec vitest run \
  electron/productionRun/productionGenerationOperationStore.test.ts \
  electron/capabilityCore/mcpGenerationTools.test.ts \
  electron/productionRun/productionRunRepository.test.ts \
  electron/productionRun/productionRunResume.test.ts
```

---

## Task 3: 让现有 semantic operation 成为默认路径，并拆开 gate/start

**Files:**

- Modify: `electron/capabilityCore/mcpGenerationTools.ts`
- Modify: `electron/capabilityCore/mcpGenerationTools.test.ts`
- Modify: `electron/capabilityCore/mcpSemanticGenerationFlow.ts`
- Modify: `electron/capabilityCore/mcpSemanticGenerationConfirmation.test.ts`
- Modify: `electron/capabilityCore/nomiMcpGenerationPlanning.test.ts`
- Modify: `electron/capabilityCore/mcpToolCatalog.ts`
- Modify: `electron/capabilityCore/generationDispatcher.ts`
- Modify: `electron/capabilityCore/mcpProtocol.ts`
- Modify: `electron/capabilityCore/mcpToolResults.ts`
- Modify: `electron/capabilityCore/mcpResultEnrichLive.ts`

**复用现有 wire tools：** `nomi_session_open`、`nomi_get_generation_context`、`nomi_operation_create`、`nomi_submit_generation_plan`、`nomi_preview_execution`、`nomi_request_generation_gate`、`nomi_decide_generation_gate`、`nomi_start_generation`、`nomi_operation_read`、`nomi_subscribe_run`、`nomi_cancel_generation`、`nomi_reconcile_generation`。禁止创建 `prepare_generation`/`approve_generation`/`read_operation` 等同义 API。

**Step 1: 写 RED capability matrix**

覆盖 Apps+Tasks、Tasks-only、Apps-only、form/url elicitation、plain tools 五类 host：

- prepare 在 2 秒内返回 operationId/`awaiting_approval`；
- `nomi_request_generation_gate` 返回 challenge + operation projection，不在同一 handler 内自动 decide/start；
- 无富 UI 时返回 typed `input_required`、deep link、nextAction；
- 原工具调用不等待 15 分钟；
- Tasks 未协商时不发送 task-augmented call；
- Apps 未协商时只返回 text/structured content；
- rich approval 不依赖把 App 附到 `elicitation/create`。

**Step 2: 接现有 receipt 和 spend hard gate**

`nomi_decide_generation_gate` 只铸/消费 revision-bound receipt；`nomi_start_generation` 才进入现有 grant/outbox/runtime。confirm boolean、host attestation 或 deep-link completion 不能直接成为 spend grant。

**Step 3: legacy adapter**

`nomi_generate`：

- 目录描述把多镜/可恢复任务引导到 semantic operation；新 host 优先返回 deprecated + operation projection；
- 兼容 host 可内部 `prepare/approve/start/read`，但不得建立第二套状态；
- 功能 flag 支持回滚到原工具，不改变项目 schema；
- telemetry 记录 legacy 使用量和阻塞时长。

**Step 4: cancellation typed outcome**

把 `{cancelled:true}` 收敛为：

```ts
{ cancelled: true, reason: 'declined'|'dismissed'|'timeout'|'surface_unavailable', nextAction, challengeId?, operationId? }
```

旧字段保留兼容，不能丢 reason。

---

## Task 4: 媒体 revision、poster 和确认卡

**Files:**

- Create: `electron/capabilityCore/generationMediaBinding.ts`
- Create: `electron/capabilityCore/generationMediaBinding.test.ts`
- Create: `electron/media/videoPoster.ts`
- Create: `electron/media/videoPoster.test.ts`
- Modify: `electron/capabilityCore/mcpPreviewImage.ts`
- Modify: `electron/capabilityCore/mcpAppWidget.ts`
- Modify: `electron/capabilityCore/mcpGateConfirmation.ts`
- Modify: `electron/capabilityCore/appIntegration.ts`
- Modify: `src/workbench/capability/capabilityApplyHandler.ts`
- Modify: `src/workbench/generationCanvas/spend/spendConfirm.ts`
- Modify: `src/workbench/generationCanvas/spend/SpendConfirmDialog.tsx`
- Create: `src/workbench/generationCanvas/spend/SpendMediaReview.tsx`

**Step 1: 写 RED media tests**

- 4 bindings 的 role/order/hash 进入 revision digest；
- 同 URL 调序必须改变 digest；
- 视频没有 poster 时 revision 不能进入 `awaiting_approval`；
- malformed file/data/local media 在 spend/provider 前失败；
- widget 的 video 使用 poster/`<video>` 语义，不允许 MP4 URL 进入 `<img>`；
- 本地绝对路径不出现在 MCP result/HTML。

**Step 2: 生成本地 poster**

复用现有 ffmpeg/媒体探测基础设施，在 preflight 读取指定时间点并产出缓存 poster；缓存键为 video content hash + timestamp + transform profile。

**Step 3: 改确认合同**

gate 传 `revisionId/digest/media[]/params/model/cost`，不再只传 `referenceCount`。UI 主标题居中，媒体横排/分组并显示 role；技术字段折叠。

**Step 4: MCP App**

prepare result 立即携带 operation card；App 只发 typed approve/open/read action，不直接铸 grant。

**Step 5: 真机视觉闸**

出 HTML mockup 与用户确认后实现；光/暗模式、1 图、4 媒体、缺 poster、竖屏窄宿主分别截图并人工读图。

---

## Task 5: 模型切换变成 revision diff

**Files:**

- Create: `src/workbench/generationCanvas/model/modelChangeDiff.ts`
- Create: `src/workbench/generationCanvas/model/modelChangeDiff.test.ts`
- Modify: `src/workbench/generationCanvas/nodes/buildNodeModelChangePatch.ts`
- Modify: `src/workbench/generationCanvas/nodes/buildNodeModelChangePatch.test.ts`
- Modify: `src/workbench/generationCanvas/model/parameterReferenceSlots.ts`
- Modify: `electron/catalog/taskParams.ts`
- Modify: `electron/capabilityCore/mcpGenerationTools.ts`

**Step 1: RED matrix**

至少覆盖：

- APIMart Seedance 2.0 A→B，同支持 1080p/13s 时保留；
- 新模型最大 5s 时产生 `13s → 5s incompatible` diff；
- aspect ratio alias 归一但不丢语义；
- reference role 重绑/丢失进入 diff；
- 已批准 revision 切模型后不可 start；
- MCP prepare 与 UI model picker 使用同一纯 diff helper。

**Step 2: 实现兼容保留**

`removePreviousControlParams + defaultPatch` 不再直接决定用户最终合同。先算 semantic params，再按新 profile 映射；默认值只填真正缺失字段。

**Step 3: UI 展示 diff**

不增加常驻说明文字；只在值真实变化时展示一张简短变更卡，核心句式：“时长 13s → 5s，因为该模型最多支持 5s”。

---

## Task 6: 一份状态、诚实 ETA

**Files:**

- Create: `electron/productionRun/generationOperationEta.ts`
- Create: `electron/productionRun/generationOperationEta.test.ts`
- Modify: `electron/productionRun/productionRunService.ts`
- Modify: `electron/capabilityCore/mcpResultEnrichLive.ts`
- Modify: `electron/capabilityCore/mcpAppWidget.ts`
- Modify: `src/workbench/generationCanvas/spend/spendConfirm.ts`
- Modify: `src/workbench/generationCanvas/runner/generationRunController.ts`
- Modify: `src/workbench/taskCenter/taskCenterEntries.ts`
- Modify: `src/workbench/production/ProductionRunTaskCard.tsx`

**Step 1: RED phase projection**

同一个 event cursor 驱动 MCP、Canvas 和任务中心。测试 vendor completed 后 verifying/asset commit 尚未完成时，不允许 MCP 显示 ready。

**Step 2: ETA store**

从项目/本地事件账本统计成功耗时，按 vendor/model/kind/规格 bucket 计算 p50/p90；最小样本数不足返回 `unknown`。不把精确用户 prompt、路径或媒体内容写入统计。

**Step 3: 删除固定常数**

删除 `video=40s/image=12s/audio=20s` 的用户可见估计。旧测试改为区间/unknown 语义，不能换另一组 hardcode。

**Step 4: 不可撤回状态**

保留并统一“已提交厂商，无法中止（费用已产生）”；取消 action 根据 phase 精确显示 `cancel`、`request_provider_cancel` 或 `reconcile_only`。

---

## Task 7: 持久化实际导出事实和 Artifact 卡

**Files:**

- Modify: `electron/export/exportJobs.ts`
- Modify: `electron/export/exportJobManager.ts`
- Modify: `electron/export/exportJobStore.ts`
- Modify: `electron/export/exportTypes.ts`
- Modify: `electron/export/exportJobs.test.ts`
- Modify: `electron/export/exportJobManager.test.ts`
- Create: `electron/export/exportResolvedManifest.test.ts`
- Modify: `src/workbench/preview/TimelinePreview.tsx`
- Create: `src/workbench/preview/ExportArtifactCard.tsx`
- Modify: `src/desktop/bridge.ts`
- Modify: `electron/preload.ts`

**Step 1: 精确 RED fixture**

用 4 个带音轨的视频 + 7 个 text overlays 构造与本次成片同形的 manifest。断言当前 job 落盘不应是 tracks=[]/mute；测试先红。

**Step 2: 调整持久化顺序**

先 `tryBuildFiltergraphExport` 得到 resolved manifest/plan，再原子创建 job；失败走 WebM 时也持久化明确 backend 与降级原因。prepared plan 可不全量落盘，但必须存 fingerprint、输入 hashes、overlay hashes 和最终 command provenance。

**Step 3: 双 manifest 字段**

- `sourceRequest`：renderer 原始请求，仅审计；
- `manifest`：实际执行事实，唯一用于 retry/re-export。

禁止继续把 source request 放在 `manifest` 字段下。

**Step 4: 项目内 Artifact 卡**

导出成功后持久显示：播放、显示文件、复制路径、再次导出；toast 只做瞬时提醒。再次导出必须读 resolved manifest 或从当前 timeline 明确创建新 revision，不能混用。

**Step 5: ffmpeg 对账**

自动解析 `ffmpeg.log`，验证 input count、音频、overlay count、输出规格与 manifest 相符。

---

## Task 8: Chapter title beat 语义动作

**Files:**

- Create: `src/workbench/timeline/chapterTitleBeat.ts`
- Create: `src/workbench/timeline/chapterTitleBeat.test.ts`
- Modify: `src/workbench/timeline/timelineTextEdit.ts`
- Modify: `src/workbench/timeline/textLayout.ts`
- Modify: `src/workbench/timeline/timelineTypes.ts`
- Modify: `src/workbench/export/renderManifest.ts`
- Modify: `src/workbench/export/textOverlayPng.ts`
- Modify: `electron/capabilityCore/mcpToolCatalog.ts`
- Modify: `electron/capabilityCore/dispatcher.ts`

**Step 1: RED semantic tests**

- 在指定 beat/frame 创建居中标题；
- 中英文两行自动 fit，不越 16:9 画布和 9:16 中央安全区；
- transition/audioCue 是受支持闭集；
- 修改已存在 beat 使用 id，不需要删了重建；
- 预览 DOM、PNG 导出和 WebM fallback 几何一致；
- MCP/Agent tool 不接受原始坐标作为主接口。

**Step 2: 复用现有 TimelineTextClip owner**

`ChapterTitleBeatV1` 编译为现有 text clip/transform/effect；不新建 timeline store。无法支持的 transition 明确返回 unsupported，不静默降级。

**Step 3: 用户可见样张**

先出“章节卡居中 + 故事画面仍可读”的真实时间轴 mockup，用户拍板后实现。默认不是底部字幕。

---

## Task 9: 真 MCP/Nomi/重启/导出闭环

**Files:**

- Modify: `tests/ux/mcp-generation-operation-journey.e2e.mjs`
- Create: `tests/ux/mcp-generation-operation-host-matrix.e2e.mjs`
- Create: `tests/ux/mcp-generation-operation-restart.e2e.mjs`
- Create: `tests/ux/mcp-generation-operation-export.e2e.mjs`
- Modify: `.github/workflows/desktop-rc.yml`
- Update: `docs/audit/<date>-mcp-generation-operation-evidence.md`

**Journey A — plain host**

prepare → typed `input_required` → Nomi 确认 → host 重新 read/start → mock slow provider → result poster。

**Journey B — Apps host**

prepare result 中显示 4 个媒体、参数、cost 和 diff；approve 后 App 投影 running→ready；不得出现第二张确认卡。

**Journey C — restart**

provider submitted 后关闭 MCP host 和 Nomi，重启后 operationId 恢复，同一 providerTaskId reconcile，raw submit=1。

**Journey D — real UI**

4 镜加入时间轴，插入 7 个 chapter beats，导出 H.264/AAC MP4；项目内 Artifact 卡可播放、显示文件、复制路径、再次导出。

**Journey E — failure**

媒体损坏、模型切换不兼容、approval stale、provider unknown、poster 失败、export compile fallback 均要有明确 phase/reason/nextAction，确认前错误保持 spend/provider=0。

**真实额度规则**

- CI 只跑 mock provider，零额度；
- 合并候选至少跑一次明确标注的真实 provider smoke，记录实际额度和 runId；
- 不用真实 provider 证明 crash/idempotency；这些必须用可控 fake provider 精确计数。

---

## Task 10: 迁移、删除旧路径与发布

**Files:**

- Modify: `electron/capabilityCore/mcpToolCatalog.ts`
- Modify: `electron/capabilityCore/mcpProtocol.ts`
- Modify: `electron/capabilityCore/core.ts`
- Modify: `docs/audit/redundancy-backlog.md`
- Update: relevant release notes and migration docs

**Step 1: 观测 legacy 使用**

发布一个兼容窗口，统计 `nomi_generate` 的 host/version/operation conversion，不记录 prompt/media。

**Step 2: 新默认**

支持新工具的 host 默认 operation path；legacy tool 返回 deprecation 与可执行迁移动作。

**Step 3: 删除旧 owner 语义**

新路径稳定后，同一 commit 删除 legacy 内的长轮询 owner、独立 confirm state 和第二份 result projection；只留窄 adapter 或彻底删除，遵守 P1 加新删旧。

**Step 4: 发布闸**

```bash
pnpm run check:filesize
pnpm run check:tokens
pnpm run check:i18n
pnpm run lint:ci
pnpm run typecheck
pnpm run test
pnpm run build
```

并额外要求：

- MCP host matrix 全绿；
- restart/raw-submit=1 对抗测试全绿；
- 4 镜真实任务闭环全绿；
- 人工读过确认卡、running、ready、export Artifact 的光暗截图；
- ffprobe + 抽帧 + 音轨 + manifest/ffmpeg 对账全绿；
- 六角色评审：CTO/设计/PM/前端/后端/真实用户均无 P0/P1；
- rollback 只切 transport feature flag，不回滚项目/Run schema。

## 2. PR 拆分建议

避免一个巨型 PR，按依赖顺序拆：

1. `operation-projection-and-trace`
2. `mcp-prepare-approve-start-adapter`
3. `generation-media-review-and-video-poster`
4. `model-change-revision-diff`
5. `operation-status-and-eta`
6. `resolved-export-manifest-and-artifact`
7. `chapter-title-beats`
8. `mcp-generation-real-journey-gate`

每个 PR 都必须基于最新 main、独立 worktree、自己全 gates；不得把尚未通过的后续阶段藏在 feature flag 后提前合并为“完成”。

## 3. 里程碑验收口径

### M1：不再卡住

用户发起后 2 秒内得到 operationId；没有可确认界面也得到明确 nextAction；关闭客户端不丢任务。

### M2：不再批错

确认卡显示真实图片/视频 poster、role、参数、模型、费用和 diff；批准的是 digest，不是模糊动作。

### M3：不再猜状态

MCP、Nomi 节点、任务中心和事件日志展示同一 phase/cursor；ETA 有历史区间或明确未知。

### M4：不再靠目录验收

结果和导出在项目内成为可播放、可定位、可再次执行的 Artifact；持久 manifest 与真实执行一致。

### M5：电脑点击退回兜底

完整 4 镜宣传片可通过语义工具完成确认、生成、加入时间轴、章节标题、导出与结果读取；computer-use 只用于视觉 QA 或异常恢复，不决定正常路径成败。
