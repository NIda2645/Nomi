# 结构评审 · `electron/agentLane`：一个渲染层形状的上下文对象，被当成了主进程事实的真相源（2026-09-21）

`check:symptom-cluster` 在这个模块上红：2026-09-15 到 09-21 的七天里落了 22 份根因合同。
门岗那句话是对的——**第三份合同是「这一层的结构不对」最便宜的证据，不是再修一次的理由。**

这份评审写在「两台发动机合并 · 步骤 A」第 3 项（权限档收成一个 owner）之后，
证据来自那一轮的真实改动与前两轮（Pass 3c / Pass 3e）在同一层里改过的东西，每条带 file:line。

**它覆盖的是一条轴，不是整个模块**：`LaneComposerContext` 这个上下文对象里装的东西归谁所有。
本轮我在这一层只动了 `laneDesktopRuntime.ts` 一个文件，因此只对这条轴有第一手证据；
这个模块里的工具投影、审批状态机的等待/恢复、历史分页、技能目录、编码沙箱各自还有自己的结构问题，
**这份评审不替它们作数**，下一个在那些轴上连着落合同的人欠它们各自的一份。

---

## 1. 一句话结论

这一层反复出问题的不是某个函数，是**一个边界的方向被搞反了**：
`LaneComposerContext` 是渲染层递进来的「这次对话的上下文」，但它同时被当成了
**「用户是谁、用户允许什么、这次能碰项目的哪一面」这类主进程事实**的持有者。

于是同一件事有两种可能的答案——渲染层递上来的那份，和主进程本来就知道的那份——
而**两者不一致时没有任何东西会红**：请求照常执行，只是执行的依据是错的那一份。

---

## 2. 同一个形状的三次复发（都在这条轴上）

### 2.1 `admissionSurface`：主进程派生的事实，住在渲染层的输入 schema 里（Pass 3c 已修）

`laneDesktopInput.ts` 的输入 schema 里曾经有 `admissionSurface`，`laneHost.mts` 又自己派生一份。
调用方递什么，宿主就按什么准入——那是「我说我是谁」而不是「宿主知道你是谁」。
Pass 3c 把它从 `intentSchema` 删掉，只保留主进程派生的那一份，并补了一条 `'canvas'` 的负例测试。
门表：`node scripts/door-map.mjs admissionSurface` → 0 写 / 2 读（派生它的 `laneHost.mts` 与读它的
`laneExtendedDesktopPorts.ts`），**渲染层 0 扇**。

### 2.2 `approvalPolicy`：用户设置，住在会话状态里（本轮修）

`laneDesktopRuntime.ts` 打开项目时把 `composer.approvalPolicy` 初始化成
`DEFAULT_PROJECT_AGENT_APPROVAL_POLICY`，真正的档位要等渲染层通过 `updatePolicy` 推上来。
后果有两层：

1. **时间窗**：项目刚打开、渲染层还没推之前，主进程对「用户让不让我自己跑」的回答是硬编码默认档。
2. **可达性**：不经 Agent 面板的入口（外部 MCP 宿主、全自动调度）**根本没有人推**——
   `generationTransportAdapters.ts` 的原注释就是那句「外部 MCP 宿主那条路从来不传它」。
   用户在面板里选了「全自动」，外部 AI 仍然每一步问人；而这恰恰是用户拍板要的相反行为。

修法不是在第二条路上也补一次传递（那是把同一个事实复制到第三处），而是把它升成
**主进程持有的设置**（`electron/settings/agentApprovalPolicySettings.ts`，读写各一个口），
lane 开项目时读它、用户切档时写它，其余入口一律读同一个函数。
Run 侧那套 `TrustLevel` 由纯函数 `trustLevelFromApprovalPolicy` 从它派生，三档 × 两条 spend 轴穷举有测试。

### 2.3 `trustLevel`：调用方在请求体里自报（Pass 3e 已修，本轮补上它的另一半）

Pass 3e 真机复现过：一个只持裸 bearer 的本机进程 `production.start` 带 `trustLevel:'budget_only'`
→ 200，回读看到 `gate-direction-v1 -> approved`，`decidedAt` 就是 run 创建那一刻——**没有任何人看见过它**。
修法是 `assertCallerDeclaredTrustLevel`：往「少问」的方向走必须有一次真人答过的确认。

但那条闸比对的 `userPolicy.trustLevel` 在本轮之前**恒为 undefined**（`policyResolver()` 压根不产出它），
于是它等价于「任何放松一律拒」——安全，但**用户从此再也没有办法表达「全自动」**。
一道闸守着一个没有人能合法填写的字段，这不是严格，是这条轴上少了一个 owner。
本轮把 `trustLevel` 接到 2.2 那份权威值上之后，这道闸才真正开始按「用户到底选过什么」判。

---

## 3. 为什么是结构问题，不是三次手滑

三次的形状逐字相同：

| | 那个事实 | 谁应该知道 | 实际由谁提供 | 不一致时谁会红 |
|---|---|---|---|---|
| 2.1 | 这次调用能碰项目的哪一面 | 主进程（它发的租约） | 渲染层输入 schema | 没有人 |
| 2.2 | 用户允许 Nomi 自己走多远 | 主进程（这是用户设置） | Agent 面板的会话上下文 | 没有人 |
| 2.3 | 这次 Run 的信任档 | 主进程（派生自用户设置） | 调用方的请求体 | 没有人（Pass 3e 之前） |

共同点是第四列：**分歧不报错**。三处都不是「写错了一行」，而是
「这个字段本来就不该出现在这个对象里，而它出现在那里不会让任何东西红」。

`LaneComposerContext` 之所以成为这类事实的聚集地，是因为它是这一层**唯一一个既跨 IPC、
又被每个工具读到**的对象：任何需要「随时能读到」的东西塞进它都立刻能用，而代价（谁是它的 owner）
要到另一个入口出现时才显形——那时候已经是一份新的根因合同了。

---

## 4. 这一层接下来要做的事（按能不能被机器拦排序）

1. **给 `LaneComposerContext` 的字段打「谁派生的」类型级标记 + 装配期断言**（Pass 3c 的留给后续第 4 条）。
   今天挡住 `admissionSurface` 复发的只有一条测试和一段注释；`approvalPolicy` 这一次也是靠人读出来的。
   能让编译器拦的别留给门岗（R17）。
2. **一条棘轮门岗：渲染层递进来的 lane 输入 schema 里不许出现主进程派生字段**。
   判据可以很便宜——`laneDesktopInput.ts` 的 schema 键集合与 `laneHost.mts` 的派生字段集合求交，非空即红，
   基线只减不增。今天这条不变量只写在注释里。
3. **`composer` 与 `activeInput` 两份快照的语义要写成类型而不是注释**。
   `laneDesktopRuntime.ts:145-148` 有一段注释解释「档位要读 `composer` 不是 `activeInput`」——
   一个需要注释才能读对的分歧，迟早会有人读错。
4. 渲染层 `workbenchStore` 那份档位仍是界面的本地真相源，与主进程那份靠 lane 的写回维持一致，
   **没有机器在核对**。真正的收口是渲染层改成读主进程那份（归渲染层 lane）。

---

## 5. 这份评审没有覆盖的（诚实登记）

本轮我在 `electron/agentLane` 只动过 `laneDesktopRuntime.ts`。因此：

- 审批状态机的等待/中断/恢复（`laneApprovalGate.ts`）、工具投影与 schema（`laneToolSchema.mts` /
  `laneVerbTransport.ts`）、历史与分页（`laneHistoryPage.mts`）、技能目录（`laneSkillCatalog.mts`）、
  编码沙箱（`laneCodingSandbox.mts`）各自的结构问题，**我没有第一手证据**，这里不写、也不假装写过。
- 那 22 份合同里属于上述各轴的部分，这份评审**不替它们作数**。谁下一次在那条轴上落第三份合同，
  谁欠那一份评审。
