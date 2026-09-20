# A 剩余验收证据清单（只读审计）

本记录按 `Nomi_plan_A_core_fixes_2026-09-19.md` 的 C 编号核对；测试标题中历史 C17/C18 等编号不是本表编号。范围仍为简化 A＋完整 T7：复用原 `StoryboardPlanEditor → storyboardRowActions → canvas runner`，不得新增页面、付款服务或执行框架。用户再次强调的“尽可能复用，不新造另一页面”是硬约束。

本轮先核源码与受控测试，现补核 root 已执行的真实 Electron 日志及当前脚本；本审计没有自行启动应用。绿灯仅代表对应执行时的文件与依赖边界，不能把此文当作整个最终树或安装包验收收据。

当前执行结果（2026-09-20 02:39–02:41）：Vitest 12 文件 194 项通过，日志 `/private/tmp/nomi-a-k3-k5-k7-final.log`；SDK `tsc` 退出 0，日志 `/private/tmp/nomi-a-lane-sdk-compile.log`；实际 SDK 12 文件 68 项全部通过，日志 `/private/tmp/nomi-a-lane-sdk-approved.log`。初次 SDK 运行因沙盒禁止监听 127.0.0.1 导致 60 个 fixture 启动失败（`listen EPERM`），保留 `/private/tmp/nomi-a-lane-sdk-final.log`；经批准在沙盒外原样重跑通过，无测试或生产代码修补。

## C01–C30 早期逐项证据（历史快照）

本表保留初轮缺口及当时判断；当前已关闭项与仍有阻断项以文末“最新验收状态”为准，不再把本表的早期待验措辞直接当作现状。

| C | 已定位证据／检查点 | 尚需收口 |
| --- | --- | --- |
| 01 | restart 计划记录沿用独立分支、dirty 保护和源树来源 | 最终 tracked/untracked 明细、最终提交及候选包身份；未完成 |
| 02 | production generation scope/batches 与付款端到端套件 | 付款代理提交当前 33→3 的实际卡/授权/submit 证据 |
| 03 | generationBatches / operationStore 非法 scope 校验 | 汇总省略、空、重复、未知、跨目标逐项结果，不能用 C02 替代 |
| 04 | spend-panel-write-ownership 原组件宿主测试 | 卡翻页/全部/新批次独立草稿当前结果 |
| 05 | payment quote CAS 与 storyboard 保存边界由两 owner 分别负责 | 模型/版本/费用变化、已批准载荷不可变；确认期间 target guard 单独记录 |
| 06 | agentPanelSpendConfirm/batches 及原 runner grant | 双击/重放一次有效提交当前日志 |
| 07 | production submit 持久化与 reconcile；安全 failure 文案 | accepted+response lost 后重启不重付、unknown price 非零；真实供应商未验证 |
| 08 | 最新 spend-layout-green：实际编辑/关闭、不同 PID 冷启动不复活卡、同 operation 再申请恢复 prompt/size；整 nodes snapshot 比较，仅允许原迁移补 renderKind；images=0 | 非空真实生成历史、其他 scope/批次组合及安装包另验 |
| 09 | payment owner 正在修 close/confirm/draft 生命周期 | 竞争裁决的当前红绿日志和真实卡交互 |
| 10 | 原 batch/anchor 展开、原 runner 复用测试 | 对照实际展开付费集合和 quote，不仅证明调用原 runner |
| 11 | generationBatches 后续批次；卡草稿 quote identity | 成功/失败/关闭后分别再申请当前证据 |
| 12 | `/private/tmp/nomi-c12-c15-real-owner.log`：真实 repository/service/operation owner，真实 nodeId 作为 jobId 查询/取消给 typed absence；正确 taskRef 查询 draft | 这是正式适配链受控对照，GUI/真实任务身份仍须最终旅程 |
| 13 | laneExtendedDesktopPorts 同 raw ID generation/export 查询取消，两域计数、缺 domain 拒绝 | 当前最终树回归，真实 GUI/工具入口归 root |
| 14 | productionTaskAbsence 用真实 repository→service→operation；adapter 伪造 code/secret；failure 安全下一步 | 当前最终树回归；不能把损坏 mock 为 not-found |
| 15 | C12/C15 实际 owner 正式 check 路径返回 draft 的 not_started，jobs/submits 为空且 Run 未被取消或执行 | 用户可见投影与真实供应商任务仍须最终旅程 |
| 16 | 保存代理及 core-a-creation-runs，原完整 editorial 往返 | 旧项目副本与最终包冷重启结果；开发构建不代替包 |
| 17 | useAgentPanelV4Actions/laneClient 的等待切目标；原 action/save 捕获目标；runner 审批后再次 guard | root 核全部 await 边界当前用例，不能只测发送前 |
| 18 | 原保存格式/unsupported 校验 | 最终包打开旧/半迁移/不支持夹具、源文件未改写证据 |
| 19 | 既有删除/Undo 路径，应由生命周期验收代理核 | 整组一次 Undo 结构/关联恢复，以及文稿/prompt 焦点快捷键不串域 |
| 20 | lane-original-input 真实 pi 重发保留全文/skill/附件；V4Actions 不清新草稿 | Electron 真实技能＋附件组合旅程；附件测试目前为稳定 claim，非真实文件上传证明 |
| 21 | input-stop / input-stop-workspace / abort-input / stop-partial + V4Actions late ACK | SDK 及 Electron stop-current 已通过 Stop/Continue/原前缀/冷历史零额外模型请求；完整技能附件队列恢复仍未由此证明 |
| 22 | history-compaction 实际落盘至少两次 compaction；模型最终请求含原任务/技能；assistant IDs 不重复 | SDK 回归及 Electron history-current2 冷重启历史已过；Electron 该脚本不制造 compaction，不能替代 SDK 压缩证据或供应商能力验收 |
| 23 | laneClient 旧 workspace push/重连权限；SDK workspace selection/lifecycle 和当前分支分页；追加 pending loadOlder→换 workspace/reconnect/切 lane | 已补受控组合：client 25/25、实际 SDK history 7/7；见下方执行补记。真实 Electron CJ3 仍须单列 |
| 24 | T7 审计：history A→B→A、core-a-composer 单多单 | 真实 Electron 图/视频与结果消失路径，详见 T7 表 |
| 25 | T7 harness cancel/lostcapture/blur/hidden/unmount/readonly 与独立 stage | 受控绿灯不替代真实舞台可继续编辑 |
| 26 | T7 lazy retry/zero size/four edges/zoom；实际命中输入 | 最新开发构建双语截图与底dock真实参数点击已过；最终人工截图裁决/安装包及完整矩阵见 T7 表 |
| 27 | actual NodeGenerationComposer 双宿主真实键盘/参数点击，canonical 节点不变；readonly 阳性探针 | 最新 spend-layout-green 已过实际付款草稿编辑/关闭/冷重启/再申请；其他批次/异常矩阵仍单列 |
| 28 | agentTraceIpc sender/project await 校验、缺失/非文件拒绝；diagnostics/redaction；native trace tests | trace-current2 已过真实工具 3/3、会话/项目查看轨迹入口及 Finder reveal 路径；恶意秘密冷重建脱敏仍未由此证明 |
| 29 | runtime walk 支持 --packaged 且断言 isPackaged/userData | 当前最终安装包、旧项目副本、编辑保存重开及适用导出未由本代理验证；Windows 未验证 |
| 30 | dirty tree 仍大量生产增量 | secret scan、contracts/build/review、提交树与包/证据 manifest 一致，最终交付前执行 |

T7 已有详细证据：`docs/audit/2026-09-20-core-a-t7-acceptance.md`。历史 `/private/tmp/nomi-t7-controlled-final.log` 为两文件 29 项通过；它不自动覆盖之后付款修改。K3 历史 `/private/tmp/nomi-k3-adjacent-final.log` 为 6 文件 76 项通过，同样不是全 A 收据。

## 最小定点套件（分组执行，不重复整库）

K3/K5 renderer/K7 Vitest：

```sh
pnpm exec vitest run electron/productionRun/productionTaskAbsence.test.ts electron/productionRun/productionRunRepository.test.ts electron/agentLane/laneExtendedDesktopPorts.test.ts electron/agentLane/laneVerbTransport.test.ts electron/shared/agentCapabilities/verbs/verbProjections.test.ts electron/capabilityCore/generationTransportAdapters.test.ts electron/shared/agentLane/laneFailureFromDecision.test.ts src/workbench/ai/v4/useAgentPanelV4Actions.test.ts src/workbench/ai/lane/laneClient.test.ts electron/diagnostics/diagnosticsBundle.test.ts electron/diagnostics/catalogRedaction.test.ts electron/diagnostics/agentTraceIpc.test.ts
```

实际已安装 pi SDK＋loopback：先编译，再执行；不能编译失败后继续跑旧 emit。SDK tests 用真实 session/branch/磁盘/HTTP fixture；不使用真实收费供应商。

```sh
pnpm exec tsc -p tests/agent-runtime/tsconfig.json
node --test --test-concurrency=1 --test-timeout=60000 .tmp/agent-runtime-tests/tests/agent-runtime/lane-original-input.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-replay-admission.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-input-stop.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-input-stop-workspace.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-abort-input.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-stop-partial.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-history-compaction.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-compaction-input-context.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-workspace-selection.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-workspace-lifecycle.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-trace.test.mjs .tmp/agent-runtime-tests/tests/agent-runtime/lane-trace-redaction.test.mjs
```

付款、完整保存、原 runner 和 T7 专项由对应 owner 交最新套件，不在此重复发行施工命令。full-review F08/F10/F11/F14 的旧付款超时/红测需由当前运行更新，不能重复称为仍红；F12/F13 的 K3 修复有上述历史绿灯；F09 有正式 bootstrap/restart reference snapshot 绿灯但不等于实际供应商参考生成。历史 F14/F15 与之后口头 F14–F17 不是同一编号体系。

## 最小真实应用旅程建议（root 串行统一启动）

下列已有脚本均复用 createRuntimeWalk：独立 tempRoot/settings/userData、loopback model，默认非 production fixture。开发模式须先构建。支持的 `--packaged /绝对路径/Nomi.app/Contents/MacOS/Nomi` 会实查 isPackaged 和实际 userData，不接受改报告字段冒充安装包。

| 命令 | 实际能证明 | 不能证明 |
| --- | --- | --- |
| `node tests/ux/agent-lane-stop-resume.walk.mjs` | Stop/Continue、原 native 前缀、冷启动零额外请求；新增真实技能＋文件排队取消恢复、重发原消息保新草稿 | 不替代 SDK compaction 或安装包证据 |
| `node tests/ux/agent-ui-d-lossless-history.walk.mjs` | 真 read 工具结果逐轮进 HTTP、重启历史 | 模型实际执行第二轮删除；该轮 fixture 只是文字回复 |
| `node tests/ux/agent-trace-log.walk.mjs` | 3 回合真实工具、派生 trace、真实 Finder reveal 路径 | 恶意秘密冷重建全部边界、适用媒体导出 |
| `node tests/ux/lane-live-skills.walk.mjs` | 会话不重开导入技能、下一轮索引、真实 chip | 原附件 replay；不是 CJ3 的替代品 |
| `node tests/ux/agent-spend-card.walk.mjs` | 原卡编辑/关闭/冷重启/恢复、zh/en；新增 33 项中 3 项分页、全部/逐镜两层草稿、两笔 pending 顺序与关闭隔离 | 不证明确认后的后续执行批次、真实供应商付款或任意 pending 导航 |
| `node tests/ux/core-a-creation-runs.e2e.mjs` | root 管理的原编辑器保存/绑定/放置真实路径 | 原四类生成执行需实际 runner 测试与轨迹配合 |
| `node tests/ux/core-a-composer.e2e.mjs` | 真实画布 keyboard/参数、历史按钮 A→B→A、单多单、重启 | history fixture 的受控结果不是供应商媒体生成 |

`agent-v4-retry-storm.walk.mjs` 测的是模型连续错误工具写入与 UI，不能因为名字含 retry 就拿来证明“原消息重发不清新草稿”。以上旅程不足以自动闭合 CJ1–CJ4 的所有组合；当前缺口须保持逐项未验证，Windows 一律未验证。源构建、真实 Electron＋模拟服务、真实供应商、安装包分别报告。

## C23 追加受控验收

root 授权后仅追加现有测试，无生产修改：

- `laneClient.test.ts` 增三项：真实 createLaneClient 持有 loadOlder ACK 后换 workspace／reconnect／同 workspace 切 lane。旧订阅强制迟到仍不覆盖新投影；历史命令携原 workspaceId/expectedLane/expectedSessionId；旧 approval 拒绝，新 approval 或 prompt 阳性对照仍可发送。前两项使用实际 workbenchStore 检查新草稿及 revision 保留。
- `lane-history-compaction.test.mts` 增一项：实际 pi 落盘 90 条，原 history owner 先读出 80→90 条，再持有命令完成，切 research 后放行；真实 workspace.publish 重新读取当前 active，仅发布 research，不将旧页重新挂回；旧 expectedConversation approval 被拒，零 provider 请求。
- 日志：`/private/tmp/nomi-c23-client.log` 25/25；`/private/tmp/nomi-c23-sdk.log` 7/7；SDK compile 退出 0；`nomi-c23-test-types.log` runtime 0、总 63 低于基线 76；`nomi-c23-lint.log` 0 errors，原有 prefer-const warning 1。

真实 composer2 失败只读排查：隔离项目事件日志是 snapshot restored(empty)→node added→model metadata updated→node removed，并无第二次 hydrate snapshot。NomiStudioApp 已在完整 hydration/surface/lane/receipt 恢复后才挂 studio，暂不能归因测试没等 ready。删除事件由 deleteNode 或 deleteSelectedNodes 都可能产生，尚不能确定调用者。经 root 授权在原 `core-a-composer.e2e.mjs` 只加 DOM 输入/同步 store 删除栈观察，输出 `composer-input-observations.json`；不改变原交互、不增加等待、不改生产。

## 最新验收状态（2026-09-20，交付前中间快照）

当前仍是“已实现未推送、验收未完成”。以下逐条替代早期表的对应待验状态；保留所有历史失败，不把分拆通过累计成最终树收据。

| 边界 | 当前结果与证据 | 仍不能推出的结论 |
| --- | --- | --- |
| Stop／完整技能附件组合（C20–21） | `.tmp/pi-lane-stop-resume-development-1789864027903/report.json` 为 passed：真实技能 chip＋实际文件排队取消恢复原输入、重发原消息保留新草稿，以及 Stop/Continue/native 前缀/冷历史零额外模型请求均通过 | 不替代 SDK 压缩、候选包或供应商模型能力 |
| 付款 scope／草稿（C02/04/08/27） | `.tmp/pi-spend-card-development-1789864256177/report.json` 为 passed：33 项中精确 3 项分页、全部与逐镜输入层、两笔 pending 单槽顺序、关闭隔离、同 operation/scope 草稿恢复；原 full-auto 不跳过等待、冷启动、zh/en、零媒体提交仍保留 | 没有点击付费确认，不证明后续执行批次、非空生成历史或任意 pending 导航 |
| 原 smoke | `/private/tmp/nomi-core-a-smoke-visible-editor.log`：17 assertions 通过。长 contenteditable 改为点击可见交集，并断言 elementFromPoint 与 focused；未改产品或增加超时 | 旧失败保留在 `/private/tmp/nomi-core-a-electron-smoke-v5.log`；测试点击修正不能当作生产布局根因 |
| 原创作／history／trace | `/private/tmp/nomi-core-a-electron-creation-v5.log`：13 检查通过；`.tmp/pi-agent-ui-d-development-1789860756827/report.json` 与 `.tmp/pi-trace-log-development-1789860756802/report.json` 均 passed | 开发构建＋loopback，不替代安装包或真实收费 |
| S06 全量 | `/private/tmp/nomi-core-a-unit-v5.log`：1508 文件、13884 项通过，S06 仍 60000ms 超时，1 失败、3 skipped。`/private/tmp/nomi-core-a-s06-affected-unit-final.log` 的 32 项定点通过不能关闭全量阻断 | `/private/tmp/nomi-s06-cpu-profile.log`、`nomi-s06-timed-{952,960,968}.cpuprofile` 已定位原 Run 事件全日志反复解析热点，共享 repository 修复正在进行；不是提高超时或重试的理由，未宣称修后全量通过 |
| 完整 T7 | 既有 partial CJ4 见 `/private/tmp/nomi-core-a-electron-composer-v5.log`；原 `tests/ux/core-a-composer.e2e.mjs` 的补充场景正在收口，实际宿主状态/结果清空/切面与异常手势/lazy 恢复等扩展仍待 root 串行实跑 | 脚本已扩展、语法通过或 hooks 测试通过均不等于完整 T7 已过；详见 [T7 表](2026-09-20-core-a-t7-acceptance.md) |
| 实际付费 | `/private/tmp/nomi-core-a-paid-resumed-v5/report.json` 已记录两张真实图，各 0.1 credits 实付；v7 继续原隔离项目，`/private/tmp/nomi-core-a-paid-resumed-v7.log` 与该项目 `.nomi/project.json` 当前显示两图＋首帧图成功、video running，尚无 v7 最终 report | 首帧视频仍进行中，不能写付费全程通过；费用仅采用供应商已返回值，未知保留 unknown，不能再次从头重复付费 |

当前真正剩余：S06 共享读取边界修复及全量复验；完整 T7 新增实际宿主场景与最终双语截图人工裁决；首帧视频产物、重开及费用收据；最终候选包旧项目副本编辑/保存/冷重启/适用导出；C18 其他格式边界、其余未覆盖组合及最终交付身份。原 ×3 页面接线的基线缺口仍按 restart 处理，不另造变体产品，也不冒称页面已通过。Windows 未验证。

旧项目候选包已有可用历史受控源：`/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-storyboard-exec-QHHOuI/projects/storyboard-exec-walk`。workspace v2、旧分镜结构和实际 JPG 已只读核验，源 manifest SHA256 为 `3f4068714c1fc375c751f0a8e757d43c8b35ad46011b9669c04f896be6b2cb9c`；`/private/tmp/nomi-old-project-setup-probe.log` 证明复制 32 文件一致且源未改。`tests/ux/core-a-old-project.packaged.mjs` 尚待最终包执行；该源是历史受控旅程项目，不是用户生产项目，也不代表 v1/半迁移/unsupported 格式已验。

交付审查：`/private/tmp/nomi-core-a-final-delta-review.md` 记录 v5 相对 v3 的逐 hash 复审，当前修改后需重新冻结。中等模型／跨模型尝试返回 unsupported/404，未执行，不能声称独立跨池通过。当前 `git rev-list --left-right --count origin/main...HEAD` 为 **17 behind / 18 ahead**；上游重叠路径见 `/private/tmp/nomi-upstream-overlap.json`，主代理将处理集成与相关复验，尚未完成。最终须 scoped commit/push/PR 与用户指定的独立 PR 审查，不自动合并。

历史未归因 `canvas.node.removed` 继续保留，随后绿灯不能确定其调用者；另一次 locator 重复计数修正不是它的根因。feel findings 由 root 逐项人工裁决，脚本 passed 不代表全部视觉通过；原左栏继续以 PR #808 获批交互为准。
