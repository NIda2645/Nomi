# 结构评审：「这份配置读不出来怎么办」没有主人

📎 交接/日志 · 2026-09-21 · 触发：`check:symptom-cluster`（`electron/catalog` 与 `electron/assets` 两层在 7 天窗口里各收到 ≥3 份根因合同）

> 这份评审只覆盖本次聚类点名的、与配置读写有关的那几层：`electron/catalog`、`electron/assets`、`electron/settings`。
> 同一次门岗输出里还有另外三个簇（生成 Run、跨层共享契约、界面文案），那是并行 lane 的成果，
> 不在这份评审的范围里，也不该由这份评审代答。
> **刻意不在这份文档里写出那三层的路径**：门岗认的是「审计正文里出现过这个模块路径」，
> 写出来就等于替别人把红灯关掉了——那正是这条门岗要防的事。

## 症状聚类说明了什么

门岗的原话是对的：**第三份合同是「这一层的结构不对」最便宜的证据，不是再修一次的理由。**

把 `electron/catalog` 这 7 天的 12 份合同按「它们各自在补什么」归一下类，能看见两种形状，而不是 12 个独立的 bug：

| 形状 | 合同 | 共同点 |
|---|---|---|
| **一个字段同时被当成两个意思** | credential-failure-preserved-clause、credential-destination-is-user-confirmed、vendor-upsert-drops-fields、ownership-single-source | 某个字段（`enabled`、`authScheme`、`assetIngestion`）没有单一 owner，于是写入边界各自解释它，解释不一致时**不报错** |
| **一个状态没有 owner，于是每个读者各自回答** | 本次 config-never-silently-lost、model-onboarding-order-walls、background-run-project-identity | 「读不出来怎么办」「还没准备好怎么办」「这次属于哪个项目」都没有归属层，答案散在调用点上 |

两种形状其实是同一件事的两面：**语义没有主人 ⇒ 每个用到它的地方重新回答一次 ⇒ 答案不一致时没有任何东西会红。**
这和 2026-09-18 那条「一个语义没有主人就会被重新发明」的结构发现是同一条，只是这次落在配置读写上。

## 本次这一簇的结构事实（可核对）

- 「userData 下的一份配置读不出来时该怎么办」在改动前有 **15 份各自独立的答案**：
  `readJson(path, fallback)` 一份（吞掉一切异常）、`try { readJsonFile } catch { DEFAULT }` 十三份、
  `electron/assets/downloadPrefs.ts` 的裸 `fs.writeFileSync` 一份（连原子写都没有）。
- 其中一份（`electron/catalog/catalogStore.ts` 旧 `readCatalog`）的答案是「把默认值原子写回盘」——
  一次 JSON 解析失败或一次 Windows 文件锁就永久抹掉用户全部模型配置。
- 与之对照：**项目数据**（`electron/workspace`）早就有「原子写 + 独立备份文件 + 损坏改名隔离 + 从备份恢复」三件套。
  也就是说这套形状我们一直有、只是没有被复用到配置上——不是不会做，是没有人规定配置也归它管。
- `electron/assets` 这一层被卷进来的原因只有一个：`downloadPrefs.ts` 也在 userData 下存用户偏好，
  于是它也长了一份自己的答案。它不是资产管线的问题，是**配置读写没有主人**这件事溢出到了资产层。

## 裁决

1. **不再逐处修。** 把这个问题收成一层原语 `electron/configFileStore.ts`，15 处全部改走它、不留并行版。
   调用方从此**连表达「读失败就写默认」的手段都没有**：`readConfigFileOrDefault` 只给内存里的默认值，
   `writeConfigFileAtomic` 在读失败时直接抛。
2. **判断合并，入口不合并。** 47 扇门里的 15 个写入口不是 15 份策略，而是 15 个 store 各自决定「写哪个文件、写什么形状」
   ——那是它们自己的职责。把它们合成一个写入口会造出一个知道全部配置形状的上帝模块，那是更坏的结构。
3. **加一条机器判据**，因为「记得走那一层」靠自觉一定会失效：`check:no-default-overwrite`（AST 棘轮，已进 `gates:contracts`）
   扫两种语法上看得出来的写法——catch 块里写盘、`if (!读回来的东西)` 里写盘。登记必须带理由，收敛掉必须同 commit 删登记。
4. **`electron/assets` 这一簇的结构结论**：`downloadPrefs.ts` 不该自己回答配置读写的问题，已改走同一层原语。
   这一层剩下的合同（媒体种类判定、发布身份、导入进度、项目上下文）属于另一条线（「一次导入属于哪个项目/哪个产物」），
   不在本次收敛范围；下一次它再聚类时，应当照同样的方法先问「这几份是不是同一个没有主人的语义」。

## 留下的账

- 渲染层还有三处同形的裸 catch（`useWorkflowCatalog` / `AiModelsSection` / `useAgentPanelV4Data`），
  各自还要配横幅与文案，归并行的渲染层 lane。已登记进 `src/ui/onboarding/catalogReadFailureIsVisible.test.ts` 的棘轮：
  只减不增、修好就删登记、再长出第四处当场红。
- 门岗判据是语法级的：把写盘包进自己的函数、再在 catch 里调那个函数，它看不见。这是刻意的窄
  （宽了会报一大片然后被塞进豁免名单）；运行时由原语的写门兜住。

正本与逐条改法：`docs/plan/2026-09-21-config-never-silently-lost.md`、
合同：`docs/fixes/2026-09-21-config-never-silently-lost.root-cause.json`。
