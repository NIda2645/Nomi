# 项目会话撤销后的结果与面板终态

状态：🚧 进行中；PR 802 已批准修复范围内的跨池 B 复核。

## 先查别人

- [既有 session 方案](2026-09-17-project-surface-session.md)：页面切换保持身份，换项目与真实 reload 永久撤销。
- [共享执行 owner](../../electron/capabilityCore/capabilityExecutorRegistry.ts)：bounded abort race、port read 和后置身份验证都可能遮盖已发生的写。
- [既有回执生命周期](../../src/workbench/generationCanvas/agent/proposalUndo.ts)：只允许有补偿证据的画布恢复；不能用空 compensation 宣称文档或导出已经撤销。
- [结构审计](../audit/2026-09-17-project-session-artifact-boundaries-structure.md)：跨池两个候选都须证据闭环，不放宽身份校验。

## 修复边界

区分“副作用前拒绝”和“派发后缺少可信结果”：主执行器与 surface port 的 abort、timeout、回包校验失败必须保留已有 capability_receipt_unresolved；读取保持取消语义。正常业务拒绝保留原码。document adapter 不降级未知结果，lane 不把未知结果的 preparing receipt 写成 undone，renderer 不用空补偿恢复未知非画布写。

主进程主动关闭 workspace 必须发布一次 closed 终态（无 pending/running/retry）再释放订阅。IPC 释放相应 active，renderer 清旧 current/审批。仅下次用户新 prompt 可以按仍打开的完整原 binding 请求全新 session；切项目清掉该重开上下文，不复活旧审批，不因临时 IO 失败弱化永久撤销。

## 验收与回滚

先红：五种写 × session/caller/reply-identity 中断；实际文档落盘后撤销仍保留 preparing；空补偿不得置 undone。补 main workspace、IPC 与 client 终态/重开、切 B 不重开 A 测试。相关类型与合同门禁、真实 Electron 集成由主任务复验。无文件迁移和删除；按本逻辑提交 revert，无旧路径 fallback。

第一批已验证：上述 17 个反例先红后绿；5 套件 97 项通过，包含新增派发后 timeout、畸形成功响应与未知异常；自动 lane close 测试直接等待 onClosed，已删除手动 close 的遮盖。生产/测试类型、定向 lint、根因合同通过。第二批终态发布仍实施中。
