# Nomi 综合审计报告（2026-09-30）

本报告记录基于主分支 `ae47842f56cdc829a60fb214436c31b04399d9df` 的综合审计，以及本分支对首个最高优先级问题的修复。审计只使用合成凭据和本地夹具，不包含任何真实密钥、内部工具路径或供应商响应内容。

## 证据与边界

- 合同门：108 条中 105 条通过，3 条为既有 advisory；没有把 advisory 当成通过，也没有发现新的阻断项。
- 单元/领域证据覆盖了凭据绑定、出站策略、供应商错误归类、模型列表分页和本地回环网络夹具。
- Electron 图形窗口与 Playwright GUI/E2E 在本次执行环境不可用，因此不能把桌面启动、真实渲染器交互或打包态旅程写成已验证。
- 真实供应商、真实用户凭据、付费生成、国内无代理网络和生产代理配置均未执行；相关结论标为未测试（`untested`），不以 mock 结果替代。

## P0：凭据随跨源重定向泄漏（已修复）

### 证据链

1. `electron/vendor/vendorHttp.ts:218-228` 将带鉴权头和请求体的供应商请求交给 `fetchVendorWithBaseFallback`。
2. `electron/vendor/vendorBaseFallback.ts:219-228` 再交给 `appFetch`，原调用没有指定 redirect 策略。
3. `electron/appFetch.ts:14-21` 保留调用方选项并调用原生 `fetch`；默认策略会跟随 302/307/308。
4. `electron/vendor/vendorOutboundGuard.ts:120-160` 只校验初始目的地，不能看到后续重定向的最终 origin。
5. 接入向导的协议探测 `electron/ai/onboarding/onboardingIpc.ts:48-85` 同样发送带 `Authorization`/`x-api-key`/自定义头和 POST body 的请求，原来没有拒绝重定向。

本地双端口复现：源端口返回指向另一端口的 302、307 或 308。默认跟随后，目标端口可收到 `x-api-key`、`x-tenant-key` 等自定义鉴权头；307/308 还会保留 POST body。该复现不需要真实供应商或真实凭据。

### 修复

- `fetchVendorWithBaseFallback` 的首发和官方备用域重发都强制 `redirect: "error"`。供应商请求没有已证明的跨源跳转需求，因此不保留自动跟随路径。
- onboarding 协议探测 POST 强制 `redirect: "error"`。
- 模型列表分页原本已使用 `redirect: "manual"`，并校验分页链接必须保持候选 origin/path；本次保留该既有契约。
- 新增真实本地 HTTP 双端口回归：vendor 与 onboarding 各覆盖 302/307/308，断言目标端口零请求、零鉴权头、零敏感 body；同时保留正常非重定向和官方 fallback 测试。

## 其他高优先级发现与方案

| 优先级 | 发现 | 具体解决方案与验收 |
|---|---|---|
| P1 | 批量取消存在竞态：取消、超时或新一轮结果到达的顺序可能让旧结果回写节点或消费记录。 | 在批次和节点写回处使用 fencing epoch/operation id；取消后拒绝迟到结果，提交、回写和花费收据做同一事务边界。补充取消与迟到响应交错的真实 loopback 测试。 |
| P1 | `localStorage` 备份清理、恢复和并发写入的组合路径仍可能互相覆盖，配额失败后恢复证据不足。 | 使用单一 journal/CAS 写入门；备份按版本保留并在恢复后校验校验和；清理、恢复、并发保存和冷启动各有故障注入测试，任何失败都要返回可行动状态。 |
| P1 | registry JSON 损坏时存在启动解析抛错风险，可能让整条能力注册链退出。 | 解析失败时隔离并重命名坏文件，加载安全空快照并把状态标为 `unavailable`；记录脱敏原因，不能静默当成空注册表。 |
| P1 | Agent/Skill 刷新顺序可能先发布工具面再发布 skill 快照，短窗口内出现旧 skill 指针配新工具目录。 | 用单调 snapshot generation，在 skill、工具和能力投影全部就绪后一次性发布；刷新期间保留上一份一致快照，增加并发刷新顺序测试。 |
| P1 | 未知任务状态被 UI 默认显示为 queued，掩盖了需要 reconcile 的状态。 | 状态投影采用显式 `unknown`/`needs_reconcile`，禁止未知值落到 queued；界面给出可操作的恢复或重新查询动作，并为未知枚举加契约测试。 |
| P1 | multipart/音频出站路径存在绕过统一 outbound policy 的风险，可能使用不同传输入口或未登记的媒体操作。 | 所有 multipart、音频提交和轮询统一进入已审 transport/policy owner；未登记 operation 在发出请求前拒绝。补充带文件体、音频体和自定义头的 wire 级策略测试。 |

## 排序与后续验收

1. **已完成（本 PR）**：关闭 P0 跨源重定向凭据泄漏；先用失败测试证明默认跟随，再以 `redirect: "error"` 修复并通过 302/307/308 回归。
2. **下一项 P1**：先收口批量取消的 epoch/fencing 与迟到结果写回，再做 localStorage journal/CAS；两项都需要故障注入和冷启动证据。
3. **随后 P1**：修复 registry 损坏隔离、Agent/Skill 原子刷新、未知状态投影和 multipart/audio transport 统一；每项完成后重新跑合同门和相关领域套件。
4. 合入前必须补 Electron/Playwright GUI/E2E、真实打包启动和国内无代理网络证据；若仍受环境阻塞，应在交付记录中保留 `blocked`，不能改写为通过。

## 未测试与残余风险

- 未调用任何 live/paid provider，没有真实费用、真实供应商重定向链或真实代理行为证据。
- 未在国内无代理网络环境验证官方备用域探测、DNS、代理和 TLS 行为。
- 回归测试使用 127.0.0.1 双端口；它证明凭据不会跨重定向 hop 发送，但不替代生产供应商和企业代理的端到端测试。
- Electron GUI、Playwright E2E、打包态冷启动和真实渲染器到主进程的旅程在本次环境中阻塞，待具备显示和 Electron 运行时的 CI/机器补跑。
- 本报告不声称上述 P1 已解决；它们是已确认、可复现或需要专门故障注入才能完成证明的后续工作。
