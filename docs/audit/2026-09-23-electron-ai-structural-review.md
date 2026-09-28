# electron/ai 模块结构审计

审计日期：2026-09-23
审计人：工程纪律门岗 `check:symptom-cluster` 触发

## 触发条件

7天内累积3份根因合同（2026-09-16至2026-09-22），触发工程纪律要求的结构审计。
门岗原话：「第三份合同是『这一层的结构不对』最便宜的证据，不是再修一次的理由。」

---

## 根因合同清单

以下三份合同均在 `scope_paths` 中包含 `electron/ai/` 路径，确认归属于本模块。

### 1. 2026-09-17 — 供应商协议头常量化（预签名上传 403）

**文件**：`docs/fixes/2026-09-17-presigned-put-drops-signed-headers.root-cause.json`

用户上传参考图到供应商自有通道时收到 HTTP 403 SignatureDoesNotMatch，症状看起来像网络抖动。
直接原因是 `electron/ai/requestPipeline.ts` 中鉴权方案词（Authorization 前缀）被写死为代码常量，而非从供应商声明中读取；同时 upload-initiate-put 的协议头也写死成只有 Content-Type，漏掉了供应商在预签名响应里声明的 x-amz-tagging。

类根因：「这次请求要带哪些头、前缀写什么词」是供应商在响应里告诉我们的事实，被变成了代码常量。常量化供应商自述的协议，一定会在下一家接入或同一家改配置时以同样方式再坏，且坏法是 403/401 这种看着像环境问题的错。

本合同判定为 `one_off`，修法已把 `electron/ai/requestPipeline.ts` 的鉴权装配改为声明驱动。

### 2. 2026-09-21 — 读路鉴权方案词被截断（同一把 key 生成能跑、读路 401）

**文件**：`docs/fixes/2026-09-21-auth-scheme-dropped-on-read-paths.root-cause.json`

供应商使用非 Bearer 方案词（如 Higgsfield 的 `Authorization: Key id:secret`）时，生成请求正常，而「设置→列出这家的模型」、接入向导既有连接分支、凭证页「测试连接」全部 401 或列空。

直接原因：`authHeaders(authType, apiKey, headerName?, scheme?)` 是四位置参数，读路几处只传了前三个；`modelListProbe.buildAuthHeaders` 直接写死 `Bearer`，走的是独立的一份构造逻辑。

类根因：「一把 key 怎么放进请求里」是一件事，被表达成四个可各传各的散字段加两个各写一遍的构造函数。少传一个维度在语法上完全合法，编译器与门岗都看不见，只有用户看得见（401）。2026-09-17 那轮只补了写路（`electron/ai/requestPipeline.ts`），读路没有对应的闭合，是同一条不变量的另外半边。

影响文件：`electron/ai/requestPipeline.ts`、`electron/ai/onboarding/modelListProbe.ts`、`electron/ai/onboarding/onboardingIpc.ts`、`electron/ai/onboarding/vendorHealth.ts`。

### 3. 2026-09-21 — 后台对账静默禁用用户模型

**文件**：`docs/fixes/2026-09-21-background-reconcile-disables-user-models.root-cause.json`

用户前一天还能选的文本模型，过一夜从下拉里消失，没有任何通知。触发条件是供应商 /models 列表里查不到这个 id——对中转站与自建网关来说这是常态。

直接原因：`electron/catalog/modelListReconcile.ts` 的 patch 写 `enabled: unlisted ? false : model.enabled`，由 `electron/ai/onboarding/vendorHealth.ts` 的 24 小时 setInterval 触发，强制把「供应商这次没列出」翻译成「禁用这个模型」，只发一个 `nomi:model-catalog:changed` 事件，不告诉任何人发生了什么。

类根因：「供应商这次没列出它」与「用户要不要用它」是两件事，被写在同一个赋值里。前者是随网络、网关、分页形状抖动的旁注，后者是用户的决定。「检测到的事实」直接当「该采取的动作」，中间没有人。

影响文件：`electron/ai/onboarding/vendorHealth.ts`（触发入口）、`electron/ai/onboarding/vendorHealth.test.ts`。

---

## 结构性问题分析

读完三份合同，这一层暴露的不是三种不同毛病，而是同一种设计缺陷的三个现场。

### 1. electron/ai/onboarding 是一个没有清晰责任边界的混合层

`electron/ai/onboarding/` 目前同时承担三类职责：
- 供应商接入向导的 IPC 路由（`onboardingIpc.ts`）
- 模型列表探测与鉴权构造（`modelListProbe.ts`）
- 后台健康巡检与目录对账（`vendorHealth.ts`）

前两类是用户触发的单次操作，后一类是后台定时任务，二者的安全要求和副作用性质完全不同。混在同一个目录里，导致：
- 对账逻辑可以直接调用与 IPC 路由共享的 `upsertModel`，没有任何隔离；
- 探测路径（`modelListProbe`）被复用为既是「判断 key 是否有效」也是「健康巡检」，两个问题共享同一个入口和同一份头构造逻辑，结果一处补全，另一处静默沿用缺省。

### 2. 鉴权装配没有单一实现点

`electron/ai/requestPipeline.ts::authHeaders` 是名义上的鉴权装配 owner，但：
- `modelListProbe.buildAuthHeaders` 是第二份独立实现，只传三个参数，截断了 authScheme；
- 补全 authScheme 的那次修复（2026-09-18）只覆盖了写路，读路的副本在同一次评审窗口内继续存活了 3 天，直到第二份合同把它撞出来。

两份实现的语法都合法，TypeScript 不报错，门岗不报错，只有用户的 401 才能把它撞出来。这与 `electron`（`2026-09-18` 评审）里「一份状态没有 owner ⇒ 每个消费点各自重新回答一次 ⇒ 答错了不报错」的诊断完全同构。

### 3. 可观测事实直接驱动用户数据变更，没有所有权隔离

`vendorHealth.startCatalogReconciliation` 的设计意图是「监测供应商健康」，但它通过调用 `upsertModel` 直接修改 `Model.enabled`，属于用户数据。这个字段的所有权没有在任何层被明确声明，导致：
- 2026-09-08 的设计拍板文档（`docs/plan/2026-09-08-catalog-liveness-reconcile.md`）说「自动禁用，保留配置」；
- 2026-09-21 的用户反馈推翻了这个决定（「缺口是我们的，不能让用户扛」）；
- 但代码里的这条赋值从来没有一个机器可核对的不变量声明，所以设计变更落不到代码约束上，只能靠人工逐处修改。

### 4. 本次三份合同是 electron/ai/onboarding 子层的集中暴露

合同 1（2026-09-17）的主责是 `electron/ai/requestPipeline.ts`，属于 `electron/ai` 根层。
合同 2（2026-09-21）的主责是 `electron/ai/onboarding/modelListProbe.ts`，是合同 1 修复的半边遗漏。
合同 3（2026-09-21）的触发入口是 `electron/ai/onboarding/vendorHealth.ts`。

三份都在 7 天内发生，说明 onboarding 子层是集中的压力点：每次接入新供应商、每次扩展鉴权方案，都会在这一层产生遗漏，而遗漏不会当场报错。

---

## 改进建议

以下是结构层面的改进，不是临时修复。

### R1 — 把鉴权装配收成一个 owner，消灭 buildAuthHeaders 副本

`electron/ai/requestPipeline.ts::authHeaders` 扩展成接受完整 `VendorAuthSpec`（而不是四个散字段），并成为唯一的鉴权头构造入口。`modelListProbe.buildAuthHeaders` 删除，改为调用 `authHeaders`。

验收标准：全仓中除 `requestPipeline.ts` 之外，不得有第二处拼装 `Authorization` 头的代码。门岗 `check:outbound-policy` 或同等工具在符号层面核对这条约束。

### R2 — 把 Model.enabled 的写权限限定在唯一的用户动作入口

声明不变量：`Model.enabled` 只由用户动作写，任何后台任务（包括 `vendorHealth`）只写 `unlisted` 旁注字段。用 `catalogStore` 的类型或门岗在编译期或 CI 层拦截后台路径对 `enabled` 的写。

参考：合同 3 已经提出「`vendorHealth.test.ts` 覆盖对账不写 enabled」，该测试应作为回归防线的一部分，而不只是一次性修复。

### R3 — onboarding 子层按副作用性质分拆

将 `electron/ai/onboarding/` 内的三类职责分到不同文件边界：
- 用户触发的单次 IPC 路由 → 保留在 `onboardingIpc.ts`；
- 模型列表探测（无状态、只读）→ `modelListProbe.ts`，明确其无副作用约束；
- 后台健康巡检与对账 → 单独目录或明确标注的文件，与用户触发路径隔离。

这不是拆出六个小文件的重构，而是在现有文件之间建立「这一类文件不得写用户数据」的层级约束，与 `electron/video` 评审（`2026-09-17`）里「横切关切一律参数化」同向。

### R4 — 供应商协议声明做变更检测

`builtinVendorSeeds.ts` 中每个供应商 seed 的 `authScheme`、`uploadHeadersPath`、`livenessProbe` 字段变更时，触发对应读路的回归测试。目前的修复（合同 1）已经建立了 `higgsfieldContract.test.ts`，但这是一次性的；当下一家供应商更改协议时，没有任何机制提醒工程师去核对 `modelListProbe` 等读路是否也传了新字段。

---

## 结论

`electron/ai` 不需要整体重构，但 `electron/ai/onboarding` 子层需要明确的结构治理。

当前问题不出在行数或文件大小，而出在以下两条没有被机器强制的约束：

1. **鉴权装配有且只有一个 owner**，新增的鉴权字段必须在这一个地方体现，读路和写路共用同一条装配路径。
2. **用户数据（Model.enabled）有且只有用户动作写**，后台可观测的事实落在独立字段（unlisted），两者不共享赋值。

三份合同落在同一个 7 天窗口，是因为这两条约束没有机器核对，每次新接供应商或扩展健康巡检逻辑时，违反它们都不报错。修法的重点是让违反当场变红，而不是逐个修复具体的坏值。

上述 R1（鉴权 owner 收一）和 R2（enabled 写权限隔离）是最高优先级，做完之后这一层的复发风险会显著降低。R3 和 R4 是中期结构改进，在下一次接入新供应商之前完成即可。
