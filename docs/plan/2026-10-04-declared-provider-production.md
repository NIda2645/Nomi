# 声明登记的自定义供应商进入正式生成（issue #975）· 设计卡 + 方向检查

```
改动名：声明登记 → 正式生成的所有权交接     线/负责人：fix/declared-provider-production（Opus 修复线）     类别：[花钱]
```

## 用户现场与一句话根因

v0.23.0，外部宿主经 Nomi MCP：`submit_declaration` 登记一个本机 HTTP 视频适配器（连接 id `local-52931`）→ 存 key → `nomi_try_model` 真打到适配器拿到 task_id → `nomi_operation_plan` 建得出 operation → 一进正式生成就报 `Provider local-52931 lacks required recovery capabilities: configured_provider`。画布那台发动机（`runtime.runTask`）照常能跑同一个模型。

**类根因**：「这条连接归认证管」（`catalog/certificationOwnership`）回答的是「代码拥有的策展契约有没有被认证 / 声明接管」，它只对**内置 direct-key 家**有意义——只有那里有一份代码契约、被接管时正式生成的执行器必须让开。正式生成的 provider 装配（`generationProviderBootstrap`）却对**所有家**都问这句，并在「归认证管」时让出连接；而非 direct-key 家（声明卡、AI 接入、设置页手接的中转、内置的非 direct-key 家）根本没有第二个执行器来接——执行器本来就只渲染目录里那条 mapping，认证晋升和声明登记写的也正是它。让出去的东西没人接，就绪停在初始值 `configured_provider`。

**设计意图核对（叫它 bug 之前）**：这句「让出」是 09-21 BL-1（`47e4a5f1a`，执行器从「只认 APIMart」改成遍历所有家）从 APIMart 时代搬过来的——那时它防的是「APIMart 写死的 Bearer / 端点悄悄接管一条被认证改写过的连接」。09-29 A10b（`cfd73e79b`）把判据收成一份，合同 `docs/fixes/2026-09-29-connection-certification-ownership-one-owner.root-cause.json` 的 `residual_risks` 第二条已经点名：「非内置家的认证连接（AI 接入 / 声明卡），引擎 B 仍不装配（交给认证适配器）而画布照常出图：这是既有的发动机分工……改分工时只改这一处」。全仓查过：没有任何「认证适配器」实现 `GenerationProvider`（`git grep "certified transport"` 只有错误文案与注释），`providerAdapter/serviceCatalog.ts` 的认证晋升写的就是 mapping 行。所以这条「分工」从来没有另一半。

## 9 格

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当我让自己的 AI（Codex / Claude）把一个自定义 HTTP 供应商接进 Nomi，我想让它和画布一样能被正式生成（Agent 付款卡、执行计划、外部 MCP `nomi_start_generation`、全自动 Run、续批）使用，以便多镜头批量生成不用手点。步骤：①AI 读接入套件 ②`submit_declaration` 交整份卡 ③存 key（用户在 Nomi 页面粘或 AI `set_key`）④`nomi_try_model` 试跑 ⑤`nomi_operation_plan` ⑥付款卡确认 / 全自动 ⑦派发、轮询、取产物、回填。**不做**：不给单个供应商加白名单；不放开私网产物下载、不改参考图通道（见「另外几件」）。**已知坑**：本机适配器的产物若在 127.0.0.1 上，下载这一步仍被既有安全边界拒（画布同样如此）。真实任务：(a) #975 报告者的本机适配器三模式（fast / quality / reference）；(b) 设置页手接的中转站上手加一个模型后让 Agent 生成；(c) AI 接入（继续验证）晋升过的中转连接走全自动 Run | `electron/capabilityCore/modelOnboarding/declaredProviderProduction.test.ts`（本机假适配器走完 ①–⑦ 的前六步 + 派发 / 轮询 / 产物描述）；(a)(b)(c) 真机 `unverified` |
| ★2 谁说了算 | 概念 `catalog.connection.certification-ownership`（主人 `certificationOwnership.isCertificationOwnedConnection`）不变；变的是消费者：正式生成那一侧只有内置 direct-key 家问它（`hasSafeDirectKeyScope`、`resolveConnection`、生成器的 `assertDirectKeyContract`），设置页鉴权锁照旧对所有家问。正式生成就绪的唯一边界仍是 `createGenerationProviderBootstrap`；「一行发布哪些模式」仍归 `shared/modelPublication`。碰 1 个概念 | `node scripts/door-map.mjs isCertificationOwnedConnection`（4 扇门：bootstrap / apimartGenerationProvider / directKeyCredential / rendererCatalogMutation）；`node scripts/door-map.mjs createGenerationProviderBootstrap`（appIntegration / liveGenerationRuntime / mcpStdioServer / parity 夹具） |
| ★3 一致与复用 | 不新增任何判据：删掉 bootstrap 里对非 direct-key 家的那句「让出」，正式生成的就绪从此和画布（引擎 A，按模型发布判）对同一份目录给同一个答案。自己写了什么：零新逻辑；两段注释、一份类测试、一份端到端测试 | `git grep -n isCertificationOwnedConnection electron`；`electron/parity/certificationOwnershipParity.test.ts` 仍绿 |
| ★4 全状态 | 没有新界面。正式生成里用户可见状态不变，只是「configured_provider（没配）」这条假话对非 direct-key 家消失：就绪 → 付款卡照常弹（或按档位代答）→ 派发中 → 轮询 → 成功回填 / 失败进 needs_attention / 取消沿用既有 Run 语义。文案无改动 | 不适用：无新文案、无新界面 |
| 5 中途表 | 见下表 | `declaredProviderProduction.test.ts`、`generationProviderBootstrapOwnership.test.ts`；断网 / 重启 / 连点沿用既有 Run 测试，本改动不碰那段 |
| 6 外部数据与失败 | 外部来源：用户 / AI 声明的卡（mapping、鉴权放法、地址）。偏差：卡写错 → 供应商回 4xx / 任务失败，job 进 needs_attention，原文经脱敏回传；鉴权放法错 → 401，不甩锅成「key 不对」之外的别的话（沿用既有分类）。新增风险：声明了却从没试跑成功的卡现在也能进正式生成（与画布一致），花钱前仍过付款卡 | 不适用官方链接：供应商是用户自己声明的 |
| 7 性能预算 | 就绪判断少一次 `isCertificationOwnedConnection` 扫描，不新增 IO | 不适用：无热路径新增 |
| 8 真实条件 | Windows 本机跑过单测与本机 HTTP 假适配器端到端；真 App、真付费、英文界面、干净安装均 `unverified`（本线不发起真实付费） | 测试输出见报告 |
| ★9 验收与回滚 | 验收（另一条线）：①在 v0.23.0 形状的目录上（声明卡标记、带 key）问 `createLiveGenerationRuntime().readBootstrap()`，该家 `providerReady: true`；②真 App + 本机假适配器走一次 `nomi_start_generation`，确认付款卡仍弹、派发打到适配器、产物描述回来；③内置 APIMart 上 A10b / certification-owned 两条仍按旧答案拒。回滚：revert 本线的 fix 提交（单文件一行删除 + 注释），无数据迁移 | 独立验收报告待补（四类强制，验收线不得是本线） |

### 格 5 · 中途表（正式生成，本机 / 自定义声明供应商）

| 处境 | 修前 | 修后：用户看到什么 | 花费 | 回执 |
|---|---|---|---|---|
| 声明了、没试跑 / 试跑没过 | 就绪失败 `configured_provider`，不发请求 | 就绪；付款卡照常弹（或按档位代答）；卡写错则上游报错，job 进 needs_attention，原文可读 | 走付款卡；是否扣费取决于上游在哪一步拒（创建即拒通常不扣） | Run 账本 / job attention |
| 试跑过了 | 同上，仍 `configured_provider` | 同上一行：试跑成功不落盘、不改变就绪（与画布一致） | 同上 | 同上 |
| key 被删 | `configured_provider` | 仍 `configured_provider`（`credentialIsUsable` 拦，计划 / 授权阶段就停）；授权后才删：提交时 `resolveConnection` 取不到 key，发请求前报 provider 错 | 不扣 | 授权失败 / provider 错 |
| 适配器离线（提交时） | 到不了这一步 | 连接被拒 = 请求未到达，按既有「未到达」分类处理，不盲目重发已到达的请求 | 不扣（请求没到） | job 错误 / attention |
| 适配器离线（轮询时） | 到不了这一步 | 轮询错误按既有逻辑记 warn、下轮再查，直到批次时限 | 上游可能已扣（任务已受理） | 批次轮询日志 |
| 产物在本机私网地址（127.0.0.1） | 到不了这一步 | **下载被既有安全边界拒**（`trustedLocalOutputOrigin` 只信 ComfyUI）；批次把它当暂时错误反复重试直到时限 | **已扣、拿不到产物**（画布今天同样如此）——见「待拍板 A」 | 批次日志 `batch-observe-failed` |
| 停 / 关窗 / 重启 / 连点 | 不变 | 沿用既有 Run 语义（Run 耐久、重启后按 reconcile 续），本改动不碰 | 同既有 | 同既有 |

## 方向检查（RW：`generationProviderBootstrap.ts` 14 天内第 3 个 fix）

**0. 一句话根因**：正式生成的就绪是引擎 B 自己的一份答案，它的判据是从「只认 APIMart」时代逐条搬来的，没有一条规则保证它和画布（引擎 A）对同一份目录给同一个答案。

**1. 归类表**

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| `47e4a5f1a` BL-1 | 装配只认 `apimart` 一家 | 引擎 B 就绪判据带着单一供应商时代的假设 |
| `cfd73e79b` A10b | 用户自加一行带标记 → 整家 APIMart 关门 | 同上：模型级标记被当连接级归属 |
| 本次 #975 | 非 direct-key 家带标记 → 整条连接让出、没人接 | 同上：「让出给认证」只对有代码契约的家成立 |

**2. 为什么一直冒**：引擎 B 的装配不读引擎 A 的「能不能用」（`catalogModelAvailability`），而是自己列条件；每条条件都在 APIMart 上成立、在别的家上没人验证。对拍矩阵（`electron/parity`）的目录里只有内置家，非内置 / 声明 / 本机这几类人群不在矩阵里。

**3. 不改结构的话接下来会冒的（可验证预测）**

| 预测 | 怎么验证 |
|---|---|
| 声明 `authType: "none"` 的本机适配器在正式生成仍是 `configured_provider`（`credentialIsUsable` 要求有 key；画布对 none 放行，见 `catalogStore.ts` 的 `listOnboardingAgentCandidates`、`catalogModelAvailability.ts`） | 在 `generationProviderBootstrapOwnership.test.ts` 里加一格 `authType: "none"`、不存 key，断言就绪 |
| 参考素材走 `inline-base64` 的家（内置 modelscope / minimax / meshy，以及接入套件第二份样例教 AI 写的形状）带参考图进正式生成必拒：`productionReferenceUrls.ts` 只收 `http(s)` | 给这几家任一镜头挂一张参考图走 `prepareProductionGenerationAuthorizationWithReferences`，期望 `generation_reference_url_unavailable` |
| 本机适配器产物在私网地址：正式生成扣了钱拿不到产物，批次反复重试下载直到时限（与 #975 报告里「后 3 镜一直 polling、主进程高 CPU」形状一致，未证同源） | `declaredProviderProduction.test.ts` 最后一条（materializer 拒 127.0.0.1）+ `multiShotBatchScheduler.observeUnitOnce` 把下载失败当 pending |

**4. 靶子独立性**：对拍矩阵与引擎 B 是同一批人写的，矩阵目录只有内置家——靶子漏了人群。本次新增的类测试把「非内置 / 内置非 direct-key」两类人群 × 四个写标记的真实写门放进来。

**5. P0**：不是我们独有的东西要现成方案；「同一份目录、两台发动机给同一个答案」是我们自己的双引擎结构问题，没有现成库可接。

**6. 补 / 重写 / 删**

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 补 | 给声明卡来源单开一条白名单 | 小 | 又一个特例分支；手加模型 / 导入 / 认证晋升那几类照样关门 | 否 |
| 删（本次） | 删掉 bootstrap 对非 direct-key 家的「让出」，认证判据在正式生成侧只留给有代码契约的家 | 一行 + 注释 + 两份测试 | 声明了但没试跑过的卡也能进正式生成（与画布一致，付款卡仍在） | **是** |
| 重写（限一个模块） | 让 bootstrap 的就绪直接派生自 `catalogModelAvailability` + 「这家需要哪种传输、引擎 B 有没有」一张表，把上面三条预测一起收掉 | 中：牵涉 authType none、私网产物信任、inline 参考三处，各自有安全 / 存储取舍 | 会顺带放开私网下载与大体积 data URL 入封存信封，需要用户拍板 | 本次不做，交协调会话 |

**7. 用户要权衡的核心**：要不要让「用户自己声明的本机供应商」享有和 ComfyUI 一样的待遇——信任它自己那个本机地址来取产物、把参考图以内联方式送过去；这两件放开了，本机适配器才算在正式生成里真正走通，但它们都是「AI 写进来的地址能让 Nomi 访问本机私网」的安全口子。

**特征测试**：`electron/capabilityCore/generationProviderBootstrapOwnership.test.ts`（修前 21 红 / 7 绿，修后全绿）；`electron/capabilityCore/modelOnboarding/declaredProviderProduction.test.ts`（修前就绪 / 派发 / 重启三条红，修后全绿；materializer 拒私网那条修前修后都绿，钉住既有安全边界）；既有 `generationProviderBootstrap.test.ts` 的 A10b 与 certification-owned APIMart 两条不变、仍绿。

## 待拍板（交协调会话，本线不擅自决定）

- **A. 本机供应商产物下载**：选项 ①维持现状（只信 ComfyUI，本机声明供应商在正式生成会「扣了钱拿不到产物」，画布同样）；②信任这条连接**已绑定 key 的那个 origin**（用户在 Nomi 自己的 key 页面确认过的去向；`set_key` 由 AI 代填时也会产生绑定，需要一并决定算不算）；③就绪前置拦：连接地址是私网且不受信任时，正式生成就绪直接拒（不花钱，但本机适配器在正式生成永远不可用）。推荐 ②，并把 `multiShotBatchScheduler` 对「确定性下载失败」的无限重试改成进 needs_attention（独立一刀）。
- **B. inline-base64 参考图进正式生成**：封存信封里放整段 data URL（体积大、落盘），还是封存「素材身份 + 哈希」、提交那一刻再现算 data URL。推荐后者，独立一刀，影响内置 modelscope / minimax / meshy。
- **C. 声明了但没试跑成功的卡能否进正式生成**：本次按「与画布一致」放行（付款卡仍在）。如果要「试跑过才放行」，需要把试跑结果落盘成模型行上的证据，是新功能。
