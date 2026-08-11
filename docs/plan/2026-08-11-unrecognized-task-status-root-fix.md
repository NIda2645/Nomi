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

---

# 追加：同一病根的第二条路径 —— 「没有 query op 也回 queued」

日期：2026-08-11（承接上文，同一收口点 `executeTaskQuery`）

## 病根（一句话）

`executeTaskQuery` 末尾的兜底 `return { status: "queued" }` 在**根本没有查询接口**时也照回 —— 而
`queued` 是「再查一次」的指令。于是每一轮都答「还在排队」，直到硬超时。

上文修的是「上游给了个不认得的动词」；这条是「**我们压根没有第二次请求可发**」。两者同一个
病根：**兜底语义默认乐观**。上文的修复够不着这里 —— 那条判定要求 `unrecognizedStatus` 非空，
而同步 create 的响应通常连 status 字段都没有（`rawStatus` 为空 ⇒ `unrecognizedStatus` 也为空，
这正是「不误伤」的第一道保险）。

## 可达性（先验证再动手，不是猜的）

两条真实进入路径：

| # | 受理点 | 怎么进来 |
|---|---|---|
| A | `runtime.ts:445` | 有 mapping 但**无 query op**。`newapiTransportFor("image")`（`newapiTransport.ts:304`）只给 `create`，`catalogCommit.ts:222` 因此不写 `query` 键 ⇒ **所有中转图像模型**都是这形状。create 回 200 但无产物、无状态动词、无 error（如空 `data[]`、通道不可用）→ `resolveTaskStatus` 归成 `queued` → 非终态 → 受理 |
| B | `runtime.ts:506` | 无 mapping 的 fallback 提交，`if (!assetUrl) admitTask(...)` |

B 尤其致命：它**正是在 `extractAssetUrl` 为空时才受理**，而轮询兜底再调一次同一个
`extractAssetUrl(cached.raw)` —— 同函数、同入参，**注定**得到同一个空值。这条路 100% 永远转圈。

关键不变量：`cached.mapping` 是受理那刻的快照；`cached.raw` **只在** query 分支里被改写，
对无 query op 的任务那段永不执行 ⇒ 两个输入都冻结 ⇒ 答案永远相同 ⇒ **事实是终态且可知**。

## 用户体验（改前 → 改后）

- 改前：节点转圈 2min（快道）/ 20min（视频），最后一句含糊的「可能仍在上游运行·可找回」。
  中转写在 create 响应里的真因（`no available channel`、余额不足）**一次都没到过用户眼前**。
- 改后：第一次轮询（~1.5s）就落 `failed`，文案说清「这个模型没有配置查询结果接口，而本次
  创建没有返回产物」，并把上游原话附在后面。

## 改动

| 文件 | 改什么 |
|---|---|
| `electron/tasks/taskResultQuery.ts` | 末尾兜底 `queued` → 终态 `failed` + `desktopT` 文案 + 上游原话；`traceVendorCompleted` 记终态；`taskCache.delete` |
| `electron/i18n.ts` | 2 个新 key `tasks.noQueryOperation` / `tasks.upstreamSaid`（zh-CN + en，R15） |
| `electron/tasks/unpollableTaskQuery.test.ts` | 新回归（与 `unrecognizedTaskStatusQuery.test.ts` 同风格：只桩 HTTP 边界与 catalog 磁盘读） |

**为什么修在轮询层而不是受理层**：`executeTaskQuery` 是「这个任务什么状态？」的**唯一**收口点
（缓存命中 / 无状态重建 / 三条轮询循环全经它）。修在受理层要改 N 个 admit 点，且将来新增一个
admit 点就会漏 —— 修在收口点一处覆盖全部入口。（另：`runtime.ts` 巨壳门岗基线 540/540，也加不了行。）

**清缓存的额外好处**：之后「重新拉取」会走无状态重建，那条路**重读 catalog** —— 模型若后来补上
query op 就真能查出来；留着旧快照反而把它钉死在「永远查不了」。

## 验收门

- `electron/tasks/unpollableTaskQuery.test.ts`：无 query op 首轮即 failed（路径 A/B 各一条）、
  上游原话透传、终态后不退回非终态、**且**「create 已带产物」的分支照旧 succeeded（不误杀）
- 已验证 5 条用例在修复前 4 条失败（`expected 'queued' to be 'failed'`），修复后全过
- `pnpm run gates` 全过
