# 简化 A＋完整 T7：现行验收状态

本表冻结时状态：已实现未推送，准备分支评审与 PR。后续提交、评审收据和 PR 状态以实际 Git/PR 为准；未获用户合并授权。范围只接原分镜编辑器的数据、目标、保存及原节点/runner，不扩 T3。此页持续更新；remaining-acceptance/T7 旧章节保留为历史证据，不把旧 running/behind/未跑描述当现状。

## 已核结果

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
