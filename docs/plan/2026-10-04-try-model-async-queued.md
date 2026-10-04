# 试跑碰上异步供应商：queued 不是失败（0.23.1 热修）

> 设计卡（花钱类，9 格全填）。根因合同：`docs/fixes/2026-10-04-try-model-async-queued.root-cause.json`。

## 1. 用户怎么用
用户让自己的 AI 接一个新供应商，AI 调 `nomi_try_model` 试跑一次。用户在 Nomi 窗口确认花钱（或「全自动」档代答），之后等结果。

## 2. UX 思路
试跑花一次钱，只该得到一个明确说法：出图了 / 供应商拒了（带原话）/ 已提交还在跑。最后一种是新增的：AI 要把「已提交、别重试」转述给用户，而不是改卡重来。

## 3. owner
- 提交后等什么、等多久：`electron/capabilityCore/pollTaskToTerminal.ts`（全仓唯一一份，画布同款 headless 生成也用它）。
- 把等待结果翻成试跑回复：`electron/capabilityCore/modelOnboarding/tryModel.ts`。
- 钱闸不动：仍是 `spendGrant` + `spendDecidedByPolicy`。

## 4. 中途表（等待期间钱和试跑分别是什么状态）

| 时刻 / 事件 | 钱 | 这次试跑 | AI / 用户看到 |
|---|---|---|---|
| 确认前 / 未确认 / 没窗口 | 没花 | 没发生 | needs_input，可再调 |
| 供应商收下（queued），正在等 | 已花 | 进行中，最多等 4 分钟（视频 15 分钟，`NOMI_POLL_TIMEOUT_MS` 可改） | 工具调用还在等 |
| 等到 succeeded | 已花，换来产物 | 成功 | 产物 + 供应商原文 |
| 等到明确失败 | 以供应商为准，原话在返回里 | 失败 | provider_failed + 原话 |
| 等不到终态（到点） | 已花 | 未完成，不是失败 | still_processing + 任务号 + 明说「不要重试」 |
| 查询连续 45 秒不通 | 已花 | 同上 | still_processing（不判失败） |
| 用户关窗 | 已花，供应商任务照跑 | 等待在主进程里，关窗不影响；窗口只在确认钱那一刻用，非全自动档下窗口不在则一开始就没提交 | 同上各行 |
| 断网 | 已提交则已花 | 查询失败按免费重试，45 秒不通后 still_processing | still_processing |
| Nomi 重启 / 崩溃 | 已花，供应商任务照跑 | 试跑中断，进程内任务缓存丢失，Nomi 不再跟踪这一单 | AI 调用断开；用户可去供应商后台按任务号查 |

任何一行都不重新提交，所以不会因为等待而重复扣费。

## 5. 失败
- 宿主没给查询函数：遇到 queued 照样说 still_processing，不判失败。
- 同步供应商：完全走原来的路，行为不变。

## 6. 性能数字
等待间隔：视频 3 秒、其余 1.5 秒（与画布同策）；上限同 headless 生成。不加新后台任务。

## 7. 真实条件
本机 loopback 假异步供应商 + 真 `runTask` / `fetchTaskResult`；不发起任何真实付费生成。

## 8. 验收
`electron/capabilityCore/modelOnboarding/tryModelAsyncQueued.test.ts`（4 条，修前红：真实代码把 queued 判成 provider_failed）；`electron/capabilityCore` 全目录对照干净 main 无新增红。

## 9. 自己写了什么、为什么必须
没有新写通用能力：`pollTaskToTerminal` 是把 `generateOnProject` 里已有的轮询搬成共享函数（净减一份循环）。新增的只有 `still_processing` 结果码——它表达「花了钱的单子还在跑」的领域语义。

## 方向检查（RW）

### 0. 一句话根因
「提交之后怎么等」没有单一 owner：画布同款 headless 生成自己轮询，试跑完全不轮询，所以试跑把「还在跑」当成「失败」。

### 1. 归类表

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 本次：试跑 queued 判失败 | tryModel 只看首次返回 | 提交后等待无共享边界 |
| `renderStaticFrame` 注释记载的首帧漏轮询 | 新调用者没抄轮询 | 同一类 |

### 2. 为什么这一类会一直出现
轮询写在调用者里，新调用者不抄就漏。本次把主循环收成一个函数并迁入两处；`renderStaticFrame` 与 ComfyUI 认证还各有一份。

### 3. 不改结构的话会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个新调用者又只看首次返回 | `grep -rn "runTask(" electron` 看调用者是否都经 `pollTaskToTerminal` |
| 剩下两份循环的放弃条件与主循环漂移 | 对照 `renderStaticFrame`、`comfyCandidateTest` 与 `pollTaskToTerminal` |

### 4. 靶子独立性
假供应商由本线写，但判定方（真 `runTask` / `fetchTaskResult`）不是；修前红是真实代码给出的 `provider_failed`。

### 5. P0
通用部分（轮询）收成一份；领域部分是「花了钱的单子不许说成失败」。

### 6. 补 / 重写 / 删

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 补 | 只在 tryModel 里再写一个循环 | 小 | 第三份循环 | 否 |
| 重写（限一个模块） | 抽共享 `pollTaskToTerminal`，主循环与试跑共用 | 中 | 动了画布同款生成的循环 | 是（本次） |
| 删 | 去掉试跑 | 失去接入验证 | 大 | 否 |

### 7. 用户要权衡的核心
剩下两份轮询（`renderStaticFrame`、ComfyUI 认证）要不要也并进来；本次热修不动，避免扩大花钱路径的改动面。

## 特征测试清单
`tryModelAsyncQueued.test.ts` 钉住：queued→成功、queued→明确失败、等不到终态、宿主缺查询函数；同步供应商由既有 `acceptanceLoopback.test.ts` 钉住。
