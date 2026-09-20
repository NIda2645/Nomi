# 简化 A＋完整 T7：现行验收状态

**用户实测后再次纠正：不能宣称所有用户流程修好。** 原“新建方案”漏接为 Agent，旧 Electron 测试把该错误写成成功标准。本轮原按钮红测确认0方案/1文本请求；最小修复及同构建下四条真实旅程结果、全部30 C/8 P/11 W逐项证据边界和截图见[用户工作流对照](2026-09-20-core-a-workflow-evidence-inventory.md)。当前新建已实现未推送，用户正在使用的预览未重启更新。T7两宿主资源重试仍失败；全字段编辑、Agent等待期切目标和33选3批准后完整链等缺项保留，PR不放行。以下记录保持各自历史构建身份，不替代该对照。

**2026-09-20 独立复审后更新：PR #828 仍为草稿，不能放行。** 下表是前一候选版的历史验收，不是当前修复树的通过记录。独立审查已证实批准后 ×N 切项目少执行、分镜撤销未修完整；随后真实 Electron 还复现参数条资源失败拖垮整个工作台。正在按[四项收货标准与修复计划](../plan/2026-09-20-pr828-review-remediation.md)修复并重验；Ponytail 已重新[逐条处置](2026-09-20-pr828-ponytail-disposition.md)。原 PR CI 的 Unit、Golden 和性能任务失败也必须重新对账，不由下方本机历史通过记录替代。

本表冻结时状态：已实现未推送，准备分支评审与 PR。后续提交、评审收据和 PR 状态以实际 Git/PR 为准；未获用户合并授权。范围只接原分镜编辑器的数据、目标、保存及原节点/runner，不扩 T3。此页持续更新；remaining-acceptance/T7 旧章节保留为历史证据，不把旧 running/behind/未跑描述当现状。

## 已核结果

本次复修最新状态（覆盖下表历史结论）：HEAD `9cb822c7a`，最新已测试构建来自未提交工作树 `57000efd869264a47541a546a760c35a4811d00f`，不是随后文档编辑后的工作树身份。此前全量单测 1521 文件、14069 通过、3 个既有跳过，不覆盖随后目录查询及首帧批量资格改动，也不证明真实旅程通过。当前修订未推送，用户已安装版本未因此更新。

- Undo：`/private/tmp/nomi-ir02-electron-final-v3/report.json` 的 8 项检查通过，覆盖 legacy/Run 两宿主、隐藏编辑器后画布 Undo/Redo、后续编辑保留及新 Electron 进程恢复；构建树 `7bfc558b18688f849ba79f9d0a1fd10589c063f8`。早期脚本导航失败保留，不能改写成通过。
- 批准后的画布 ×3 切项目：`/private/tmp/nomi-pr828-background-variants-final-v3/report.json` 通过，三次请求和结果均归 A，B 完整画布 hash 与媒体文件不变；构建树 `2bc878b25b763880ecd267ce30e3af8e120ef466`。这是实际 Electron 加 loopback，非付费供应商证明。
- 首帧图后视频：`/private/tmp/nomi-pr828-background-first-frame-final-v1/report.json` 保留为失败，供应商请求为零，原因为测试视频模型缺少 archetype。测试修正为真实档案及仅发布 image_to_video 的模式后，原单镜流程通过。随后又由截图和首帧槽断言复现原编辑器按 text_to_video 查询遗漏合法参考模型的旧缺陷，已修在原目录查询边界。`/private/tmp/nomi-pr828-storyboard-slot-green/report.json` 对应构建 `8fbc589113a15c3a1c463b2f052764e55777f5d1`，验证原单镜确认、两个实际请求、首帧字节传递和 A→B 后台投递；未删除原输入保护。
- 原批量首帧：原资格判断未计算计划生成的首帧，导致批量按钮禁用；真实红证据 `/private/tmp/nomi-pr828-planned-first-frame-red/report.json`。共享判断最小修复后，构建 `57000efd869264a47541a546a760c35a4811d00f` 的 `/private/tmp/nomi-pr828-planned-first-frame-green/report.json` 通过原“生成剩余”入口，确认数量 2、实际图/视频请求各 1、视频使用同批首帧 JPEG 字节、A 落盘、B 完整画布与媒体不变。主代理亲看前后截图。首帧槽空态仍红，已核对原 v6 设计合同 §4.2 明确要求必填空槽红色，相关控件相对基线未改；本轮保留该语义，不伪造绑定、不因执行通过擅自重画槽，也不把它记为新增执行错误或整页视觉通过。
- 原七镜批量：`/private/tmp/nomi-pr828-background-batch-final-v1/report.json` 在构建 `e03e0c794e6d99ac532b761f4ed048aba8282e51` 通过，批准 7 个、实际 7 请求及结果，切 B 后仍投递 A。上述后台旅程均为真实 Electron＋loopback，不是付费供应商或多轮稳定性证明。
- T7：构建树 `c458c7b78e834f424de6985d62246957560f7325` 的真实 Electron 已证局部隔离成功，但点击重试失败，仍阻塞交付。证据 `/private/tmp/nomi-t7-canvas-zh-final-v1/report.json` 与 `failure.png`，主代理已亲看截图。
- T7 原生中断：`/private/tmp/nomi-t7-native-final-v5/report.json` 的 7 场景通过，构建 `8fbc589113a15c3a1c463b2f052764e55777f5d1`。包含真实窗口失焦/最小化、节点及 Alt 复制拖动、工作区切换/卸载、组拖动一次结算、磁盘保存与冷进程恢复；测试先关闭 Playwright 默认焦点模拟，并记录 native/trusted 事件。冷恢复图在断言完整图一致后使用原 Fit view，主代理已亲看两节点；本次中文通过，未冒称英文或所有 OS 组合通过，也不覆盖上述资源恢复失败。
- T7 英文复验：`/private/tmp/nomi-t7-native-en-final-v1/report.json` 在构建 `57000efd869264a47541a546a760c35a4811d00f` 通过同样 7 项。主代理亲看 `en-native-group-reopened.png`，两节点均在原 Fit view 后可见。此证据补英文实际执行，不改前项中文构建身份；Windows 和未执行的 OS 组合仍未验证。
- T7 分块实验已否决：仅在 `/private/tmp/nomi-ev02-topology-experiment/` 独立构建，未改源码、Vite 配置或正式 dist。虽然 composer 保持 lazy 且无新增 chunk 循环/重复模块，启动静态代码却增加 2,041,944 字节、629 个非空模块提前加载，共享资源失败前移到工作台启动之前。`VERDICT.md` 明确拒绝该候选，原始 `topology-only-pass` 只表示图谓词通过，不能当恢复通过。
- 最新机械审计：`/private/tmp/nomi-pr828-audit-v6/report.json` 固定树 `bb2fa74c9a18ea0d4dc69c7d8c2cfbccb5d075cb`，474 文件。`/private/tmp/nomi-pr828-review-coverage-v6.json` 中 424 项仅为身份匹配的复用候选，14 项旧审查失效，34 项缺完整覆盖，2 项保持未关闭/撤销结论；没有把哈希吻合当语义复审。`chunkBoundary.tsx` 的旧通过判断被真实失败证据撤销。此后本页的记录更新使文档身份变化，不宣称清单自动覆盖新树。

- 审计发现的文本流式重试回归：原确认入口的 append/replace 两项有效红测及人工修改负控，修后 3 文件 52 项通过（`/private/tmp/nomi-pr828-stream-retry-green.log`）。独立源码复审 `/private/tmp/nomi-pr828-stream-retry-rereview.json` 未发现两处最小生产修改的新阻塞。此修改晚于上述已测试构建，不能沿用旧构建宣称最终 Electron 通过。原文本 IPC 的供应商幂等缺失是基线问题，本轮没有真实供应商调用，不能由 runner key 相同推断绝不重复计费。
- T7 测试报告修正：原测试在关闭 fixture 后的最终断言之前写报告，可能退出失败却留下 passed。现报告在收尾成功或失败后写入，保留所有零媒体及异常请求断言。`/private/tmp/nomi-pr828-t7-report-probe.json` 对原实际收尾代码验证正常关闭、晚到媒体、异常请求及关闭抛错；这只证明报告可信度修正，不是资源恢复通过。
- Ponytail 旧报告 26 项已逐条与源码核对：16 项落实、10 项有具体保留理由，见[处置表](2026-09-20-pr828-ponytail-disposition.md)。新提交的最终模型复审尚未完成。
- Agent 同类参考模型入口：`presentStoryboard` 查询同样漏掉仅发布图生视频的模型。此入口在真实 base 中不存在，接线遗漏属于本分支新增缺陷，不能归为原编辑器的基线缺陷。原入口红测证明缺首帧仍进入确认、新首帧未执行、已有节点沿用旧首帧三个问题；两处查询复用 `any-published` 后，3 文件 24 项通过（`/private/tmp/nomi-pr828-agent-model-query-green.log`）。目录映射、参考投影、原确认与 runner 保留，受控部分是目录/Run/授权端点及供应商执行器。生产修改晚于上述 Electron 构建，尚不能记为最终应用或供应商通过。

### 可见变化核查约束

用户再次指出对未经要求的页面变化的担忧。原 `StoryboardShotRow` 的首帧图提示词框在基线 `96d368c26c2e5c1f0534861be9b9100630275097` 已存在，仅在 `keyframe.enabled` 的视频镜头出现；此次失败测试主动启用了该模式。已有首帧图片的参考参数输入是另一条入口，不能用这张截图替代其验收。

这项源码对照只证明该文本框不是本轮新增，不证明整页、其他宿主或整个分支正确。最终差异审计仍须覆盖已提交和未提交增量，对每项可见变化记录需求依据、原行为、新行为及实际入口证据；没有依据的变化不得作为既成设计保留。审计期间暂停新增功能和布局调整。原始页面与当前页面须使用同一模型、模式、数据和视口对照，避免把不同测试状态误报为设计变化或设计等价。当前尚未完成这一轮全量核对，PR 不能放行。

| 边界 | 当前已执行结果 | 证据与限制 |
|---|---|---|
| 源码集成 | HEAD 15195e2f9，已整合 origin/main 96d368c26，整合时0 behind/20 ahead | 本轮交付前已刷新仍0 behind/20 ahead；记录时dirty差异尚未提交 |
| 最终生产增量独立审查 | 12文件35处差异，未发现有证据支持的新缺陷 | [逐处报告](evidence/core-a-20260920/final-production-delta-review.md)；不是全分支或跨模型无缺陷声明 |
| 全量单测 | 1516文件、13964通过、3跳过；SDK482、janitor13、stats8全部通过 | unit-final-v10；随后测试/文档更新另记，不替换源树身份 |
| 合同门岗 | v14整套两项阻断已定点修复并复验；其余阻断门通过 | root-cause最终48/48、30高风险文件；walkthrough-final-v17通过、基线63不升；3项advisory保留。原v14红日志不改写 |
| 原编辑器基本走查 | 17断言通过 | smoke-final-v8；亲看原固定底栏窄屏亮/暗图 |
| 参数条真实宿主 | partial CJ4通过：键盘时长5→6、单多单、原锁定语义、切面保草稿、历史切换、取消晚事件、多选移动/一次Undo/落盘/冷重启 | composer-final-v12；v13补强断言先复现portal键盘串域；原表面nokey修复后真实Electron v14全部通过，含参数不移动任何节点；v12不能证明该不变量；blur为受控事件，全app lazy未由此证明 |
| 删除与输入隔离 C19 | 17项真实Electron通过；整组一次Undo恢复完整图与磁盘，文稿/prompt Delete/Undo不串域，批准账本不复活 | shortcuts-final-v20；最终suite v11亦通过；旧红测及oracle归因见[关闭表](2026-09-20-core-a-findings-closure.md) |
| 画布完整回归 | v11整套13/14；唯一card-stack连线点击oracle修正后，v12该场景完整通过 | 不能把原13/14日志改写14/14；测试采用真实可点击线段，不force click，不改生产 |
| 性能与基础旅程 | 性能21场景采样通过、0 warmup失败；J3/J5及7条loopback系统旅程通过 | performance-final-v10 / journeys-final-v10 / real-user-final-v10；发生在随后portal修复之前 |
| macOS候选包 | build/dist成功，包内MCP smoke通过（23工具、165资源） | build/package-final-v14，build tree e96a8390eb94bcfb0cc239a180ba587f1face187；非公证发行包 |
| macOS旧项目候选包 | v17完整通过：原编辑器保存/冷恢复、JPG解码和MP4导出、5种拒绝格式、3种旧分镜字段形状 | [候选包收据](evidence/core-a-20260920/candidate-v17-receipt.json)；原项目/Run/拒绝夹具hash不变、关闭后零请求。3种旧字段为合成夹具，不冒称历史v1；v14–v16错误oracle及红日志保留 |
| 真实供应商 | 两图＋首帧图＋首帧视频已完成；verify-only v14热恢复和两个新进程通过，付费attempt未增加 | [脱敏收据](evidence/core-a-20260920/paid-v14-receipt.json)；媒体实付1.8936 credits，Agent费用unknown；禁止从头重付 |

## 仍在执行或明确未验证

- v13 portal键盘问题已修复，真实RF原组件15判据及真实Electron v14通过，付费verify-only v14通过，未新增扣费。
- 本表冻结之后执行最终差异账本归档、分支Ponytail、scoped commit/push/PR；以交付 PR 实际结果为准。contracts和构建已执行，后续改动限测试/文档/证据。用户的外部AI复审与合并决策尚未发生。
- T7全app lazy加载失败恢复、部分真实OS中断组合仍未验；受控组件已测范围与真实宿主区分。
- 历史未知canvas.node.removed仍未归因；后续绿灯不能证明旧事件来源。
- 英文1280px分镜底条在左栏收起时仍有既有控件碰撞；按用户明确延期归[唯一TODO T-DS-01/A-2](../roadmap/TODO.md)，不冒称视觉全通过，也不擅改原布局。
- 原×3页面接线的基线缺口按restart范围记录，不用runner单测冒称UI通过，不另造变体产品。
- Windows未验证。中等模型调用404不可用，未完成跨模型审查；脚本机械清点＋同池独立审查如实区分。

## 截图

- [中文图片参数条](evidence/core-a-20260920/composer-v12-zh-image.png)
- [英文冷恢复视频参数条](evidence/core-a-20260920/composer-v14-en-restored-video.png)
- [原历史托盘与视频](evidence/core-a-20260920/canvas-v12-03-real-video-history-scrub-light.png)
- [真实付费首帧视频](evidence/core-a-20260920/paid-v14-zh-first-frame-real-video.png)

- [候选包旧项目冷恢复](evidence/core-a-20260920/candidate-v17-zh-cold-restored-original-editor.png)
- [候选包原MP4导出](evidence/core-a-20260920/candidate-v17-zh-export-complete.png)

主代理已亲看以上截图。完整日志当前在/private/tmp，PR引用持久收据/源码hash，不把本地路径当远程附件。逐处审查见 [最终账本](evidence/core-a-20260920/final-semantic-audit.json)，账本的自排除和身份边界见同目录 README。


## 交付工具补记：Ponytail 读取阻断

产品提交 `b65ce1c74` 已推任务分支，未合并。实际 `review:branch` 在模型调用前读 8,106,786 字节 diff 超过原 8,064,000 缓冲而 ENOBUFS，最初已留 deferred；这不是模型审查通过。随后继续修原适配器读取边界，见 [最小方案](../plan/2026-09-20-ponytail-bounded-diff-read.md) 和 [根因合同](../fixes/2026-09-20-ponytail-bounded-diff-read.root-cause.json)。

原 stdout 改为私有临时文件、固定64KiB读取、原150KB单元/80行上下文/超时不变。真实大分支及单8.4MB行先复现 ENOBUFS；独立复审另抓到新读取器UTF-16切半问题，补逐字节红测后修复。定点20/20通过；根因门岗48/48、31高风险文件通过。原实际分支已能生成40块，2块明确截断仅为大型审计JSON，生产代码未过滤。此补记冻结时真实模型重跑尚未完成，旧deferred不能提前accept；以PR随后实际收据为准。app src/electron未因工具修复变化，原包及付费证据边界不变。
