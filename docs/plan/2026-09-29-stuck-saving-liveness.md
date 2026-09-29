# 生成完了却一直停在「正在存到你电脑上」：取回层根因 + 节点阶段时限兜底

> 状态：🚧 进行中（2026-09-29：已在 `claude/stuck-saving-fix` 本地实现并过门岗，待协调会话真 App 验收后开 PR 合入）。根因合同：[docs/fixes/2026-09-29-stuck-saving-retrieval-liveness.root-cause.json](../fixes/2026-09-29-stuck-saving-retrieval-liveness.root-cause.json)

## 问题（一句话）

主进程取回产物时，响应头一到就被我们自己拒掉（状态码 ≥400、类型不在白名单、声明超上限），却不丢 body 就抛错，收尾又去「优雅关闭」这次请求专用的连接池——它要等那个没人读的 body 读完，永远等不到。渲染层等查结果的 IPC 没有时限，节点就永远停在「正在存到你电脑上」，停止也打不断。自 v0.22.0 起就有，0.22.4 仍在。

## 范围

- **取回层（根因）** `electron/hardenedFetch.ts`：每条拒绝路径先经唯一的 `abandonResponse` 丢掉 body；这次请求专用的连接池用 `destroy()` 收尾，不晚于本次计时器；白名单收 `application/octet-stream` 的调用方同时收它的两种别名（缺类型、`binary/octet-stream`），真类型交给落盘边界按字节判；失败时在错误上挂诊断（主机 / 路由 / 状态码 / 类型 / 大小 / 耗时，不含 URL）。
- **下载时限** `electron/shared/assets/providerMediaRetrievalBudget.ts`（数字唯一一处）+ `electron/assets/providerMediaFetch.ts`：60 秒墙钟改成「空闲 30 秒 + 总上限 60 秒 + 声明大小 ÷ 256 KiB/s（最多 860 秒）」。
- **可观测性** `electron/assets/localizeTaskAsset.ts`：取回失败写一条结构化警告，只记主机，不记路径与查询串。
- **渲染层兜底** `src/workbench/generationCanvas/runner/generationPhaseDeadline.ts`：每个非终态阶段登记最长时长与到期动作的穷举表 + 唯一的等待原语；`catalogTaskActions` 里每个等主进程的 await 都经它，停止即刻生效；「重新拉取」与结果补落地同样有时限；宽限到期把最后一次取回错误原样交出去；「可找回」与「到点收场」两类错误永不自动重试。
- **防复发**：`electron/hardenedFetch.test.ts` 三种路由 × 六种响应的存活性契约矩阵（真 socket、2 MiB body）；`generationPhaseDeadline.test.ts` 用永不返回的查结果函数驱动真控制器与真 runner；两处都做过变异校验。

## 不动项

- 制作流程的重试上限、驱动时限、取消传入下载（调查报告修法第 6 条）：要改批次调度器，与镜头认领 PR #921 碰同一块，等它合入后另开。
- 界面：云端任务的停止按钮、「可找回」节点显示原因——都要先出样张，挪到收敛之后（协调会话已记待办）。
- `electron/ai/onboarding/onboardingIpc.ts` 的协议探测「成功时不读 body 就等关闭」：有 12 秒中止兜底，已记待办，不在本次改。
- 不引入新依赖、不自研 HTTP 客户端；APIMart 查询映射（多地址全下载）不在本次范围。

## 回滚

整体回滚这 6 个提交（或回滚合入后的 PR）即可，没有数据迁移、没有外部契约变化。两层相互独立：取回层（前两个 `fix(retrieval)` 提交）与渲染层（`fix(runner)` 两个提交）可以分开回滚——例如渲染层时限在真机上误判时，只回滚渲染层，保留根因修复。

## 验收门

- 零花费复现 `D:\tmp\stuck-saving-repro\hang-repro.ts`（指向本工作树的副本）：修复前 4 行 HUNG；修复后被拒响应毫秒级报错，S3 缺省类型与缺类型交给字节校验后正常取回。
- `vitest`：`electron/hardenedFetch*`、`electron/assets`、`src/workbench/generationCanvas/runner`、`src/workbench/observability` 全绿；变异校验（把取回层修复改回原样 → 矩阵红；去掉渲染层时限 → 存活性测试红）。
- `pnpm run typecheck`、`check:test-types`、改动文件 eslint、`node scripts/check-root-cause-contracts.mjs`、`check:door-map`、`check:filesize`、`check:prior-art`。
- 真 App 验收（协调会话跑）：正常生成照常落地；结果地址返回大错误页时节点很快落「可找回」而不是挂住；ComfyUI / 本地任务在「正在存到你电脑上」时点停止立刻停。

## 先查别人

- **官方：body 必须读完或取消，否则连接不释放。** 别人怎么做：undici 文档「Specification Compliance › Garbage Collection」写明 Node 的 GC 不够积极，把释放连接交给 GC 会导致「stalls or deadlocks」，所以 always consume or cancel the response body（https://github.com/nodejs/undici/blob/main/docs/docs/index.md ），`Dispatcher.md` 的示例同样是「非 200 就 `body.dump()`」。我们：照做——每条拒绝路径都先经 `abandonResponse` 取消 body（`electron/hardenedFetch.ts:253`）；修复前只有重定向那一跳这么做（修复前 origin/main 的 `electron/hardenedFetch.ts:288`），这次收成唯一出口。
- **官方：`close()` 优雅等待，`destroy()` 立即中止。** 别人怎么做：undici `Dispatcher.md` 写明 `close()`「gracefully waits for enqueued requests to complete」，`destroy()`「all pending and running requests are asynchronously aborted」（https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md ）；装的 6.19.8 源码里 `close` 要等在途请求清零才返回（`node_modules/undici/lib/dispatcher/client.js:324`）。我们：照做——这次请求专用、用完即弃的连接池改用 `destroy()`，并且等它不超过本次请求的计时器（`electron/hardenedFetch.ts:269`）；调用方自己建的线路、应用共享的线路仍归各自的 owner，不在这里拆。
- **放弃一个响应：排干还是掐断。** 别人怎么做：undici 的 `interceptors.dump` / `body.dump({ limit })` 是「小 body 读掉丢弃以复用连接，超过上限（默认 1 MiB / 128 KiB）就中止」（https://github.com/nodejs/undici/blob/main/docs/docs/api/Interceptors.md ）。我们：不同，一律取消、不排干。理由：被拒的往往就是大 body（CDN 错误页、声明超上限，上限 200 MiB），排干既费流量又费时间；直连路由的连接池本来就是这一次专用、用完就拆，没有可复用的连接；共享线路少复用一次连接，换来「拒绝必须立刻结束」，值得。
- **空闲超时 = 两次读之间的间隔，不是整段墙钟。** 别人怎么做：nginx 的 `proxy_read_timeout` / `send_timeout`（缺省 60 秒）只计「两次连续读 / 写之间」（https://nginx.org/en/docs/http/ngx_http_proxy_module.html ）；undici 的 `bodyTimeout` 同样「monitors the time between consecutive body chunks」，缺省 300 秒（https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md ），它的入门文档示例设的正是 30 秒（https://github.com/nodejs/undici/blob/main/docs/docs/getting-started.md ）。我们：照做，空闲 30 秒（`electron/shared/assets/providerMediaRetrievalBudget.ts:27`，依据写在文件里）。不同的一点：不依赖 undici 自带的那一道——它只在解析器没暂停时才触发（`node_modules/undici/lib/dispatcher/client-h1.js:625`），没人读的 body 把解析器顶成暂停，300 秒那道兜底永远不响，这正是复现里挂过 330 秒的原因；所以我们的空闲计时放在读的那一侧（hardenedFetch 的读循环）。
- **总上限随大小放宽（最慢可接受速度）。** 别人怎么做：curl 的 `CURLOPT_LOW_SPEED_LIMIT` / `CURLOPT_LOW_SPEED_TIME`——平均速度低于某值持续 N 秒就中止（https://github.com/curl/curl/blob/master/docs/libcurl/opts/CURLOPT_LOW_SPEED_LIMIT.md ）。我们：同一个「最慢可接受速度」的思路，形状不同：按响应头声明的大小一次算出总上限（60 秒 + 大小 ÷ 256 KiB/s），一个计时器、可预测、好测；速度掉到零的情况交给空闲超时，不再另做滑动窗口测速。
- **仓库里已有的同类做法。** vendorHttp 的提交与查询总在自己的 120 秒中止之下把 body 读完（`electron/vendor/vendorHttp.ts:248`），用完的专用连接池 `void dispatcher.close()` 不等（`electron/vendor/vendorHttp.ts:291`）——所以它不是这次的挂法。渲染层的阶段时限表照 narrate 的穷举 Record 写法（`src/workbench/observability/narrate.ts:64`），新增阶段不给出口 typecheck 直接红。
- **结论：** 不引入新依赖、不自研客户端。在已有的唯一取回原语上补齐官方明确要求的响应生命周期（读完或取消、用完的专用连接池直接拆），时限拆成「空闲 + 按大小的总上限」；渲染层按仓库既有的穷举表写法加阶段时限兜底，防的是将来主进程里任何一个不返回的 await。
