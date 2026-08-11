# 未登记状态动词 → 任务永远转圈：根因修复

日期：2026-08-11 · 关联：`docs/plan/2026-08-11-model-onboarding-to-generation-roundtrip.md`（止血 commit `b12ca067`，在并行分支 `claude/confident-golick-f42477`）

## 病根（一句话）

`taskStatusFromResponse` 最后一行 `return "queued"` 把**两件语义完全不同的事**压成同一个值：

| 真实情况 | 归一结果 | 下游读作 |
|---|---|---|
| 上游说「排队中」（认得的动词） | `queued` | 继续轮询 ✅ |
| 上游说了一个**我们不认得的词** | `queued` | 继续轮询 ❌ |

`queued` 是**「再查一次」的指令**。于是上游已经返回 `status:"failure"` / `"rejected"` 时，
系统读成「还在排队」，把整个轮询预算烧完，最后报一句「可能还在上游跑」——
**真实的失败信息一次都没到过用户眼前**。

止血（补动词表）治不了：下一个没见过的动词照样中招。根因是**兜底语义默认乐观**。

## 需求核对（诚实版）

用户提的 4 条里，第 2 条与现状不符，先纠正：

- **「加轮询上限/超时兜底：不允许无限轮询」** —— **三个轮询循环今天都已经有超时**：
  - `electron/capabilityCore/core.ts:343` 240s/300s（`NOMI_POLL_TIMEOUT_MS` 可调）
  - `src/workbench/generationCanvas/runner/catalogTaskActions.ts:303` 软/硬超时（慢道 20min）
  - `src/workbench/generationCanvas/runner/recoverTaskActions.ts:80` `RECOVER_POLL_TIMEOUT_MS`

  所以**不存在无限轮询**。真正的缺口是两个：① 未知动词把预算烧满才结束，且结束语是「可能还在跑」而非真因；
  ② `capabilityCore` 超时后只是 `break`，返回 `status:"queued"` **不带任何 error** —— 对 MCP/agent 调用方
  就是一个永远非终态的结果。②是真 bug，本次修掉。

## 单一收口点（关键结构发现）

三个轮询循环**全部**经由 `electron/tasks/taskResultQuery.ts:134 fetchTaskResult` 查询：

- `capabilityCore` 注入的 `fetchTaskResultFn` → 它
- 渲染层 `fetchWorkbenchTaskResultByVendor` → IPC → 它
- 找回轮询 → 同一个 IPC → 它

且它**已经有逐任务、跨轮询的状态**（`taskCache` + `admitTask`，见 `taskResultQuery.ts:94-101`）。

⇒ 判定规则只写**一份**放在这里，三条轮询路径自动全部治好。不必在渲染层复制规则（那会变成并行版，违反 P1）。
⇒ 也因此 `TaskResult` / `TaskResultDto` / 任何渲染层文件**都不用改**：渲染层收到的直接就是 `failed` + `error`。

## 改动

| 文件 | 改什么 |
|---|---|
| `electron/tasks/responseParsing.ts` | 新 `resolveTaskStatus()` 返回 `{status, unrecognizedStatus}`；`unrecognizedStatus` **只在**上游确实给了一个非空动词、且所有表都不认得时才有值。`taskStatusFromResponse` 保留为**同一实现的取值投影**（唯一解析路径，非第二套实现） |
| `electron/runtime.ts` | `buildProfileTaskResult` 把 `unrecognizedStatus` 带在返回对象上（不进 `TaskResult` 公共类型）；`CachedTask` 加 streak 字段 |
| `electron/tasks/taskResultQuery.ts` | 有界容忍规则 + 诊断日志 + 合成失败结果 |
| `electron/capabilityCore/core.ts` | 超时 `break` → 诚实失败（缺口②） |
| `electron/i18n.ts` | 2 个新 key（zh-CN + en，R15） |

## 判定规则（怎么避免误伤 —— 需求③）

**「没给状态」≠「给了个不认得的状态」。** 只有后者才计数。
create 响应只带 `task_id` 没有 status 是完全正常的排队，不能计入。这是不误伤的第一道保险。

失败判定需**同时**满足两个条件（需求③的「重试若干次 + 超时」）：

- 连续 ≥ `UNRECOGNIZED_STATUS_MIN_POLLS = 4` 次轮询都是未认出的动词
- 且距首次出现 ≥ `UNRECOGNIZED_STATUS_GRACE_MS = 120_000`（2 分钟）

中途只要出现一个**认得的**动词，计数与计时**清零**（真在跑的任务通常会经过认得的状态）。

### 取舍（明着写，需求③的「判断依据写清楚」）

两类误判的代价不对称：

- **误杀**（未知动词其实表示「进行中」→ 被判失败）：用户损失一次**已付费**的生成。**这个更贵。**
- **误等**（未知动词表示失败 → 等满预算）：浪费时间，不丢钱。

所以窗口取**偏宽**的 2 分钟而不是几秒。对视频（硬超时 20min）这是提前 10 倍报错；
对任何真的用未知动词表示「进行中」且耗时 > 2min 的上游，会误杀——因此失败文案**明说
「也可能仍在上游运行」并带上原始动词**，用户能据此去平台核对，我们也能据日志把动词补进表里。

这两个常量集中在 `taskResultQuery.ts` 顶部，调一处即可。

## 诊断出口（需求④）

首次遇到未认出的动词即 `console.warn("[nomi:task] ...")`，带 vendor / modelKey / taskId / 原始动词，
按 (vendor, 动词) 去重只报一次，避免轮询刷屏。看到日志就知道该往哪张表补哪个词。

## 验收门

- `electron/tasks/responseParsing.test.ts` 补：未知动词有 `unrecognizedStatus`、无状态时没有、认得的动词没有
- 新 `electron/tasks/unrecognizedTaskStatus.test.ts`：连续未知 → 到阈值判失败且错误信息含原始动词；未到阈值仍继续；中途认得的动词清零
- `pnpm run gates` 全过

## 不动项

- 不改 `TaskResult` / `TaskResultDto` 公共类型（判定在收口点完成，渲染层无感）
- 不改三个轮询循环各自的超时值
- 不改 `NEWAPI_STATUS_MAPPING`（那是止血 commit 的事，且在并行分支上）
