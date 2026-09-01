# PR #223 → M1–M5 切片方案

PR #223 在 `pr223-finish@46066ed0` 的历史差异约 762–767 文件，不能继续作为一棵跨域冲突树推进。切片以风险和唯一 owner 为边界；每层可独立 review、验证、回滚。

| 顺序 | 切片 | 纳入 | 明确不纳入 | 主要验收 |
|---:|---|---|---|---|
| 1 | Host / runtime（M1） | Thread/Turn/Item/Checkpoint、CAS、lease、interrupt/steer/resume、Pi adapter、settlement reducer；删除 ephemeral/executionPrompt 生产 fallback | 新工具、Provider 扩展、UI 重画 | 30+ turn restart；旧 receipt 不重复 effect；只有 execution_settled 才 completed |
| 2 | Semantic projection（M2） | `modelToolSurfaceManifest`、generation vertical slice、12–15 semantic tools、alias merge/delete、host-only transitions | Context compaction、Deferred Loading、额外供应商 | 普通任务 ≤10；旧 alias 不再进模型；schema/property/A-B 指标 |
| 3 | Context / compaction（M3） | PromptPipe sections、JIT index/search/read、SummaryV1、stage handoff、trust/provenance/budget/cache 观测 | UI 交互改造、Provider 新能力 | 100 turn token 非线性增长；关键 ID/receipt 100% 保留；tainted 内容不能改 policy |
| 4 | UI / 真实旅程（M4–M5） | renderer 事件投影、approval card、断线/remount、J1–J5 打包 Electron、红蓝紫队 fixture、export/preview | 把 UI loading 当状态修复；跨切片复制 state | 用户目标→计划→确认→effect→画布/时间轴→预览/导出→重启恢复闭环 |

## 落地顺序与依赖

```text
Host/runtime
      ↓ durable refs + settlement
semantic projection
      ↓ bounded model surface
context/compaction
      ↓ typed/provenance projection
UI + packaged journeys
```

每层的 PR body 必须列：base SHA、changed risk surface、scope paths、class tests、旧路径删除、六角色评审和真实任务证据。Deferred Loading 不是第五个默认层：只有 semantic A/B 证明“>10 tools / >10k schema tokens / 选择错误率上升 / 长尾持续增长”之一才追加到 M5。

OPEN QUESTION：维护者裁决评论不可达；若评论要求不同的拆分顺序或 PR 依赖，需在开网后以评论原文覆盖本表，并保留本表作为未裁决的方案基线。

