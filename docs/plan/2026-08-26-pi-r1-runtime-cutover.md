# R1：现有 Agent 运行链切换实施卡

> 状态：实施准备。R0 的独立质量审查与最终出口通过后开始产品接线。
> 承接已批准的 [逐文件迁移方案](2026-08-26-pi-agent-loop-file-migration.md)；不是另一套 Agent 方案。

## 目标与边界

在现有界面中，把创作对话、画布对话、就地分镜、方向候选、镜级校验、制作文本规划六条路径切到唯一 pi AgentSession。保留 Nomi 的模型选择、Skill、项目记忆、审批和真实业务执行器。

不重画页面，不改 MCP 的权限、ProductionRun、预算或作品 Undo；不把 R1 报成三空间统一 Agent 已完成。R2-U1 仍必须交付项目级共同会话和宿主，新增 UI 先过真实布局样张门。

## 两个必要的接缝决定

### 1. 局部 ESM，不切整个主进程

现有 `electron/tsconfig.json` 为 CommonJS；普通 `.ts` 中的动态 import 会变成 require。整个主进程切 NodeNext 的只读试编译已报 TS2835，会扩大改动范围。

采用独立 NodeNext 小项目：`electron/harness/runtime/pi/*.mts` 输出 `.mjs`，薄 `nativeLoader.cts` 输出 `.cjs` 并保留原生 import。现有 CJS facade 只加载这个已编译接缝，通过 Nomi 端口调用；SDK 类型不能越过适配层。非 Agent 的文本大脑查询不装载 pi。

构建、开发启动、类型检查、测试发现和 ASAR 都覆盖新扩展名。旧 main 存在不代表 runtime 产物齐全；启动检查要一起验证。根 Node 下限明确提高到 SDK 要求的 `>=22.19.0`，现有 CI Node 24 不另作迁移。

### 2. 完整快照不能再被气泡覆盖

当前 `conversationPersistence` 在打开项目和切历史时都调用 seed；旧 runtime key 又只有 project+area。若只改成“有快照就不 seed”，切历史会读到另一条对话的模型上下文。

R1 保留旧 area key 的字面值，但请求、恢复、清理增加显式 `threadId` 元数据，工作缓存按该 key 与 thread 寻址；不把 thread 后缀拼到旧 project 解析器里。旧历史仍分两个列表，这是 R1 的过渡边界，不是最终统一方案。

优先恢复匹配线程的完整快照。仅没有快照的旧档允许一次标明来源的历史导入；能证明归属的 v2 工作缓存保留工具对，否则保留原件并从气泡重建有限上下文，不能声称恢复了不存在的完整记忆。旧文件可恢复备份，迁移不重放工具、不恢复旧批准。

## 分片执行（同一个正式切换边界）

### A. 提取 Nomi 合同与唯一描述

- [ ] Nomi 自有请求、事件、完整工具决定和结果端口，不引入第二份 Thread/Turn/Item。
- [ ] 共享模型选择迁至 `electron/ai/textBrainResolver.ts`；非 Agent 调用者直接依赖它。
- [ ] 身份、四层 system prompt、Skill 和项目偏好复用现有内容。
- [ ] 文档/画布 Zod schema 与实际工具描述收进 `harness/tools`；删死 SDK 工具表，不复制领域规范化。
- [ ] 用现有模型排序、prompt 字节、shots preprocess、camera transform 测试验证迁移；新增入口先 RED。

### B. 迁入通过 R0 的运行核

- [ ] 迁入受控 session/model/tool/PDF/snapshot 适配，移除实验实现；根依赖固定同版 pi，保留非 Agent ai@4。
- [ ] NodeNext 小项目及原生 CJS 接缝进入 build/dev/typecheck；新扩展名进入 lint、文件体积、测试类型门。
- [ ] 唯一 SDK 事件适配：流式内容、工具结果、错误、用量和单一终态；不同时由工具桥与事件镜像重复发结果。
- [ ] Nomi 8/24 步边界与首响应 90s / 空闲 120s 通过 SDK 公开接缝控制；等人确认暂停闲置计时。
- [ ] 参数无效在同一个 SDK 循环内返回错误并有限纠正；删除独立 repair 模型调用。
- [ ] 压缩使用 SDK，保留摘要提示词/预算/用量；取消覆盖 prompt 预检、运行、工具等待与摘要。

### C. 工作快照与线程恢复

- [ ] 显式 thread 元数据接通 start/seed/alive/clear；项目解析仍使用旧 key 的单一规则。
- [ ] 新快照完整落盘；旧 v2 与纯气泡导入有版本、备份和归属验证。
- [ ] 切历史、冷启动、两 area 同名 thread、损坏快照、迁移重试均有测试；历史工具执行次数为零。
- [ ] 单次任务每次新上下文，不靠 best-effort clear 保证隔离。

### D. 现有入口与生命周期

- [ ] 薄 `agentChatV2` 调新 runtime；六条业务分支明确能力档，single-shot 零工具，planner 仅读/产方案。
- [ ] 保留完整工具决定的 result/effectiveArgs/overridesDelta/silent/denied/proposalId；renderer 已执行的结果不得在 main 再执行。
- [ ] IPC 确认/取消绑定所属窗口；重复确认、取消胜出、销窗、早于启动回执的停止均收敛一次。
- [ ] 订阅先于可能到达的流事件，避免首字、工具调用和终态丢失。
- [ ] 新对话、切项目/线程使旧 turn 失效；领域异步写入点检查仍属于原任务，旧回调不污染新会话。
- [ ] Stop 明确 cancelled；不将错误或取消又报 finished，不把聊天停止冒充已提交媒体任务撤销。

### E. 删除旧运行实现

- [ ] 删除 `agentLoop`、`agentChatHarness`、`agentStreamConsumer`、旧 CoreMessage 工作缓存实现及死工具壳。
- [ ] 对应测试转为新行为覆盖，不为删除旧代码而删除批准、拒绝、恢复、缓存用量等断言。
- [ ] 全仓扫描只剩一个生产 Agent runtime；非 Agent 文本/编译/验证仍走原 ai@4。
- [ ] 更新目录说明、旧注释和原计划状态，明确 R1/R2-U1/B4 各自完成范围。

### F. 真实任务与发布门

- [ ] 六条路径通过真实 Electron UI/IPC 到真实 SDK 和受控本机模型服务，不以直接调 adapter 代替产品入口。
- [ ] 文稿改动与撤销、画布提案与撤销、就地分镜、三个单次任务、切项目/新对话/停止、重开续聊。
- [ ] 本轮实际构建截图亲眼检查；界面沿用现状，没有获批新样张就不新增控件。
- [ ] 正式 Nomi ASAR 走同一 Agent 链和快照恢复；另回归现有 MCP 包装，记录平台覆盖，不把隔离 R0 当产品打包证据。
- [ ] 根 gates、runtime 测试、类型门、打包/走查分别记录字面退出码；真模型验证单独记录供应商与消耗，不与零额度 fixture 混称。

## 回滚与交付

- 分片用于开发和审查，不在产品中长期双写、双跑或运行时 fallback。正式切换提交同时删旧实现。
- 先保留 R0 可复核提交；R1 失败时可回到该基线，用户工作缓存由备份恢复，不改生产账本。
- 在任务分支提交并提 PR，不推 main、不合并 #179 或自己的 PR。R1 阶段报告分别说明实现、测法、结果与未覆盖项。
- R1 完成后继续 R2-U1；共同宿主的 UI 样张批准是下一道产品门，不是本阶段运行层工作的前置。
