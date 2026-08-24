# nomi-local 协议：自己拥有文件流（根治 ERR_INVALID_STATE 弹框）

> 2026-08-24 立项。对应用户回报：Windows 上弹「A JavaScript error occurred in the main process」，
> 内容为 `TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is already closed`，确定后 app 可继续用。
>
> **本文档推翻了立项时的假设**。立项假设是「Node 20 捆绑的 undici 有拆除竞态，升 Electron 即可根治」。
> 实测证明：**升 Electron 修不了这条**，而根因在我们自己的代码里。证据见 §1。

---

## 0. 一句话

`electron/protocol/localProtocol.ts` 把 `fs.createReadStream()`（Node Readable = 异步可迭代）直接塞进
`new Response()`，于是流的生命周期归 **undici 的 `ReadableStreamFrom`** 管；那里有一个**无保护的延迟 close**，
播放器一 seek/卸载就可能在 close 已经发生后再 close 一次 → 从 microtask 里抛出、**任何 try/catch 都接不住**。
改成**我们自己构造 ReadableStream 并自带关闭闸**，这条路就不再经过那段代码。

---

## 1. 根因（已实证，非推测）

### 1.1 崩溃栈精确落点

用户栈（PR #125 单测逐字照抄的那份）第 2 帧：`at node:internal/deps/undici/undici:1465:28`。
拉 Node v20.18.0 的 `deps/undici/undici.js` 对行号：

```js
1454: function ReadableStreamFrom(iterable) {
1461:   async pull(controller) {
1462:     const { done, value } = await iterator.next();
1463:     if (done) {
1464:       queueMicrotask(() => {
1465:         controller.close();          // ← 第 1465 行第 28 列，与用户栈逐字对上
1466:         controller.byobRequest?.respond(0);
```

`ReadableStreamFrom` 在 undici 里**只有一个上游调用点**——`extractBody` 的第 5329 行：

```js
5320: } else if (typeof object[Symbol.asyncIterator] === "function") {
5329:   stream = object instanceof ReadableStream ? object : ReadableStreamFrom(object);
```

这是**「应用自己塞了一个异步可迭代当 body」**的分支，**不是**网络响应体的拆除路径。
网络响应体那条从 undici v6.0.0 起就有 `readableStreamClose()` 保护（吞 "already closed"），
所以坊间把这条错误归给「fetch 响应流竞态」是**认错了路**。

### 1.2 竞态机制

`ReadableStreamFrom` 的 `cancel()` 只有一行 `return iterator.return()`——**不设任何关闭标记**。于是：

1. `pull()` 调 `iterator.next()`，返回一个 pending promise；
2. 消费方取消（播放器 seek / 节点卸载 / 导航）→ controller 进入 closed；
3. 步骤 1 那个 `next()` 才 resolve，且 `done === true`；
4. `queueMicrotask(() => controller.close())` 在**已关闭**的 controller 上执行 → 抛 `ERR_INVALID_STATE`；
5. 抛点在 microtask 里，promise 早已 settle → **落到 uncaughtException**，call site 的 try/catch 全无效。

### 1.3 升 Electron 修不了（逐版本查源码，不是查 changelog）

| undici 版本 | 随哪个 Electron | `ReadableStreamFrom` 的 close |
|---|---|---|
| 6.19.8 | **Electron 31（现状）** | 无保护 · `undici.js:1465` |
| 7.29.0 | **Electron 42 / 43** | 无保护 · `lib/core/util.js:635-638` |
| 8.10.0 / `main` | 当前最新发布 | 无保护 · `lib/core/util.js:663-664` |

**本机实证**：在 Node 24.13.1 / undici 7.18.2（比 Electron 43 捆绑的还新）上，用手控 `next()` resolve 时机的
异步可迭代喂 `new Response()`，稳定复现同一条错误、同样的帧构成，且 call-site catch 一无所获：

```
TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is already closed
    at ReadableByteStreamController.close (node:internal/webstreams/readablestream:1162:13)
    at node:internal/deps/undici/undici:1538:30
```

结论：**这条与 Electron/Node 版本无关**，是 undici 至今未修的结构性缺陷（未检索到对应的上游 issue，
标注为「疑似未被上报」而非「已知已修」）。

### 1.4 我们的代码在这条路上

全仓生产代码里把 Node 流塞进 `new Response()` 的**只有两处**，都在本文件：

- [`electron/protocol/localProtocol.ts:112`](../../electron/protocol/localProtocol.ts#L112) — `streamRange()`，Range 请求（视频拖动进度条走这条）
- [`electron/protocol/localProtocol.ts:145`](../../electron/protocol/localProtocol.ts#L145) — 整文件

其余 `new FormData()` 路径（`audioTaskRunner` / `customCallRunner` / `multipartOperation` / `localAssetFile` 等）
一律用内存 `Blob`，走 `extractBody` 的另一分支，**不经过** `ReadableStreamFrom`，不在本轮范围。

### 1.5 一个需要说清的反讽

`localProtocol.ts:140-143` 现存注释写着：为修 `ERR_INVALID_STATE`，已从「包 net.fetch 的 undici 流」
改成 `fs.createReadStream`。那次改动修掉的是**双属主**那一类，但把代码**留在了 `ReadableStreamFrom` 这条路上**——
换了个 close 点，错误码相同。所以那条注释现在**描述的不是事实**，本轮一并改写（P1：加新必删旧，含过期注释）。

### 1.6 诚实标注：没证到的那一环

用真实 `fs.createReadStream` 在 Electron 之外**没能复现**：360 次、6 档时序偏移，含模拟 Electron
`protocol.ts:150` 的 `Readable.fromWeb(res.body)` + abort，全部干净。
机制已证、我们的代码确实在这条路上，但**「我们这个 fs 流在真机上确实触发」这一环只能靠 Electron 内走查闭合**，
因此写进 §5 验收门，而不是在此断言。

---

## 2. 范围（本轮做什么）

1. 新增 `electron/protocol/fileResponseStream.ts`：`createOwnedFileStream(filePath, opts)`，
   返回**我们自己构造**的 `ReadableStream`，关键是一个同步置位的 `closed` 闸，使 close/cancel 不可能互相竞争：

   ```ts
   const finish = (fn) => { if (closed) return; closed = true; try { fn(); } catch {} };
   nodeStream.on("end",   () => finish(() => controller.close()));
   nodeStream.on("error", (e) => finish(() => controller.error(e)));
   // cancel() 里同步 closed = true，再 destroy 底层流
   ```

   已用与生产同形的脚本验证：200 次 cancel-mid-flight **零 ERR_INVALID_STATE**；
   整文件读字节数 262144/262144 相符；`{start:100,end:599}` 区间读 500/500 相符。

2. `streamRange()`（:112）与整文件分支（:145）改用它；`new Response(nodeStream)` 两处**全部删除**（P1，不留并行版）。
3. 改写 `:140-143` 那段已失真的注释，写清真正的机制与「为什么必须自己拥有流」。
4. 单测：`localProtocol.test.ts` 增 cancel-mid-flight 用例——取 reader → `read()` 起 pull → 立刻 `cancel()` →
   等两拍，断言进程无 `uncaughtException`。**这条测试必须在修复前先红**（TDD：先证明它抓得到这个 bug）。
5. **门岗（P2 通用性判定 / R17 同款棘轮）**：加 `scripts/check-node-stream-response.mjs`——
   静态禁止 `new Response(` 直接收 `createReadStream(...)`/Node Readable，配 baseline 只减不增，
   接进 `pnpm run gates`。理由：这类写法**当场看不出毛病**（小文件、不 seek 时完全正常），
   靠自觉记不住，只能靠机器每次拦。

---

## 3. 不动什么

- **不升 Electron**。已证升级修不了这条；EOL 是另一件事，单独立项（见
  `2026-08-24-electron-31-to-43-upgrade.md`），本 PR 与之**无依赖、可独立回滚**。
- 不动 `parseLocalAssetUrl` / 预览 token 校验 / Range 解析 / content-type 嗅探等既有逻辑，仅换流的构造方式。
- 不动 FormData/Blob 上传路径（§1.4 已证不在这条路上）。
- 不动渲染层任何代码——这是纯主进程协议层改动，用户界面零变化。
- 不动 `undici@6.19.8` 这个直接依赖（它服务的是 socks/proxy 路径，与本崩溃无关）。

---

## 4. 回滚

单文件级：`git revert` 本 PR 即可。新模块是纯新增，两处调用点各自独立；
门岗脚本若误伤，把该文件加进 baseline 或单独 revert `scripts/check-node-stream-response.mjs` 与 `gates` 里那一行。
无数据迁移、无持久化格式变更、无 IPC 契约变更，故回滚零残留。

---

## 5. 验收门

1. `pnpm run gates` 全绿（含新门岗）。
2. 新单测在**修复前必须红、修复后必须绿**（否则等于没测到东西——见记忆：断言前先证明你在你以为的现场）。
3. **Electron 内真机走查（闭合 §1.6 那一环，本轮的关键证据）**：
   起真 app → 画布放一段较大的本地视频（`nomi-local://`）→ **连续快速拖动进度条 ≥20 次** →
   切走/卸载节点 → 反复若干轮。判据：
   - 不出现「A JavaScript error occurred in the main process」弹框；
   - `nomi-crash.log` 无 `ERR_INVALID_STATE` 记录；
   - 视频画面/音画同步正常，seek 后能正常续播（证明不是靠「把流弄坏」换来的不弹框）。
   截图必须**我自己 Read 过**才算数（R13 眼见链）。
4. **修复前先在同一路径上录一次「坏」的样子**：临时把改动回退跑同一段走查，看能否复现弹框。
   复现到 = §1.6 闭合；**复现不到也要如实写进文档**，并说明本修复的依据仍是「把我们从缺陷代码路径上摘出来」。
5. 回归：`localProtocol.test.ts` 既有 11 条用例全绿（整文件/区间/后缀区间/不可满足区间/`.bin` 嗅探/预览 token 四条）。

---

## 6. 步骤（每步独立 commit）

1. `test:` 先加 cancel-mid-flight 单测 + 门岗脚本，**证明它们现在是红的**。
2. `feat:` 加 `fileResponseStream.ts`。
3. `fix:` 两处调用点切过去 + 删旧写法 + 改写失真注释。
4. `chore:` 门岗接进 `gates`，baseline 落盘。
5. `docs:` 回填真机走查结果与截图到本文件 §7。

---

## 7. PR #125 里那个过滤器的处置（P1：加新必删旧）

**现状**：`installUncaughtExceptionNoiseFilter` 在 **PR #125（`claude/festive-ptolemy-6bc946`，仍 OPEN，未合并）**，
不在 `main`、也不在本分支。PR #125 里还捆着几件不相关的修复（ComfyUI 文生视频提交死锁、失败卡可收起），
那些**有价值、不该被本轮阻塞**。

**判据（不靠感觉，靠证据）**：本轮修复落地后，执行
`pnpm install` 后在 `node_modules` 里实扫主进程依赖（重点 `electron-updater`）是否还有
`new Response(<Node 流>)` / 异步可迭代 body 的用法：

- **扫不到** → 生产代码已无路径可达 `ReadableStreamFrom` → **过滤器删除**（连同
  `isUpstreamStreamTeardownError`、`mainProcessLifecycle.ts` 的安装调用、`crashLog.test.ts` 对应用例）。
  建议 PR #125 在合并前**摘掉这一撮 hunk**，其余修复照常合入。
  理由：留着它就是个常驻逃生口，而且它**会连带吞掉我们将来自己写出的真双关闭**——
  虽然它用「栈里出现我方帧就不认」做了防护，但那道防护挡不住「我方代码触发、但栈全在 node: 内建里」的情形。
- **扫得到** → 说明还有我们管不到的第三方路径 → **保留**，但必须在注释里把「为谁而留」写死到具体包名+版本，
  并加一条到期复查（升级该依赖时重扫）。此时保留其单测意图。

无论删留，结论与证据回填本节。

### 结论（2026-08-24 实扫回填）：**删**

`pnpm install` 后实扫，两项均为空：

1. 主进程依赖闭包（`electron-updater` / `undici` / `socks` / `ai` / `@ai-sdk` / `mammoth` /
   `xlsx` / `js-yaml` / `quickjs-emscripten`）中，**无任何** `new Response(createReadStream…)`
   或 `new Response(Readable.from…)` 写法；
2. 全 `node_modules` 中 `ReadableStreamFrom` 的引用方**只有 undici 自己**，无第三方调用点。

即：本轮修复落地后，生产代码**已无路径可达** `ReadableStreamFrom`。
故建议 **PR #125 在合并前摘掉这一撮 hunk**（`installUncaughtExceptionNoiseFilter`、
`isUpstreamStreamTeardownError`、`mainProcessLifecycle.ts` 的安装调用、`crashLog.test.ts` 对应用例），
其余修复（ComfyUI 文生视频提交死锁、失败卡可收起）照常合入。

保留它的代价不是「多几十行」，而是：它会**连带吞掉我们将来自己写出的真双关闭**。
它虽用「栈里出现我方帧就不认」做了防护，但那道防护挡不住「由我方代码触发、栈却全落在 `node:` 内建里」的情形——
而那恰恰就是本次这个 bug 的形状。留着它，下次同类问题将不再有弹框提醒我们。

其单测的**意图**（「认得这一类、且绝不误伤我方真 bug」）已由本轮
`electron/protocol/fileResponseStream.test.ts` 末尾那条**上游哨兵测试**承接：
它钉住 undici 现状，哪天上游补上保护、该条会变红，届时才谈得上「可以直接用 `new Response(流)`」。

---

## 7b. 执行结果（2026-08-24 回填）

### 做了什么

- 新增 `electron/protocol/fileResponseStream.ts`（`createOwnedFileStream`，同步 `closed` 闸）。
- `localProtocol.ts:112 / :147` 切过去；两处 `new Response(<Node 流>)` **已删净**（`grep createReadStream` 零命中）。
- 改写 `:140` 那段失真注释，写清「换成裸 fs 流并不算解决，只是把关闭权从 Electron 交给了 undici」。
- 门岗：**没有新建脚本**，而是给 `check-heavy-path.mjs` 加了 `node-stream-into-response` 规则
  （计划原写「新建 `check-node-stream-response.mjs`」——实施时改为复用，因为棘轮基建现成，
  新建等于多一个 baseline + 多一道 gates 条目，换不来收益）。同时把该门岗的「族」定义
  从「卡死」拓宽为「本地看不出、线上才炸」。
- 单测 `fileResponseStream.test.ts`：7 条（整文件/闭区间/内容正确/取消不抛/fd 不泄漏/文件不存在/上游哨兵）。

### 红→绿信号（诚实版）

| 信号 | 修复前 | 修复后 |
|---|---|---|
| **门岗** `node-stream-into-response` | **红**：基线 0 → 命中 2（:112、:145） | **绿**：0 |
| 单测「上游哨兵」 | 复现出 `ERR_INVALID_STATE`，且 call site 一无所获 | 同左（钉住上游现状，上游修了它会变红） |
| `pnpm run gates` | — | **全绿**（exit 0） |
| 既有 `localProtocol.test.ts` | 绿 | 绿（无回归） |

### ⚠️ §1.6 那一环：**仍未闭合**，如实记录

新建 `scripts/local-protocol-seek-walkthrough.mjs`（主进程装 `uncaughtException` 收集器，
直接观测生产故障本身，而非截图推测）。为让它真有鉴别力，中途修了自己两个坑：

1. 第一版 fixture 1.1 MB → `readyState=4`、整段缓存完，30 次 seek 全打在缓存上，
   **对照组也是绿的**——那种"通过"什么都没证明。改成 499.6 MB 无损+噪声视频后，
   缓存覆盖率降到 **0.14–0.19**，确认是真流式、seek 真的在取消在途的流。
2. 按 URL 反推磁盘路径是错的（项目目录名是人类可读 slug，不是 `projectId`），
   已改为按文件名在盘上找。这个错误是被脚本里的自证断言当场拦下的。

**A/B 结论：在 macOS / Electron 31 上，修复前与修复后都跑不出这个崩溃。**
30 次大跳 seek + 60 次读到一半 abort，两边主进程均零未捕获异常、无 `nomi-crash.log`。

所以本轮的依据**不是**「复现→修好→不复现」，而是：
**机制已在单测里确定性复现**（`ReadableStreamFrom` 的无保护延迟 close）+
**我们的代码是全仓唯一走到那段代码的路径** + **修复把我们从该路径上整体摘除**。
这属于「消除危险类别」，不是「验证过的前后对照」——不该被说成后者。

合理解释：用户那条崩溃报自 **Windows**，而本轮走查跑在 macOS。Chromium 的媒体栈取消时序、
以及 NTFS/APFS 的 I/O 时序都不同，竞态窗口宽度可能因此差很多。

**因此下列两条列为交付后必做（否则这条 bug 只能算「大概率修好」）**：
- 在 **Windows** 上跑同一条走查（本机无 Windows；建议接进 CI 的 win 作业或找报障用户验一版）；
- 若 Windows 上对照组能复现、修复版不复现 → §1.6 才算真正闭合，回填本节。

走查另一项确定的价值：它证明了**修复没有把流式播放搞坏**（同样的 30 seek + 60 abort 下
`readyState=4`、`error=null`、缓存覆盖 0.193），并作为回归哨兵长期留用。

## 7c. rebase 时发现：main 已经换了一条路，但换到了**同族的另一条竞态**上

整合最新 `origin/main` 时撞到冲突，查明原因：在本轮开工之前，main 上已有人把两处改成了

```ts
function fileBody(filePath, options) {
  return Readable.toWeb(fs.createReadStream(filePath, options)) as ReadableStream<Uint8Array>;
}
```

（提交 `d6b16f43` / `ee139663` / `b1b48e2f`，`git tag --contains` 确认**已随 v0.20.1 发布**。）

**这确实把代码移出了 undici 的 `ReadableStreamFrom`——但移到了 Node 自己的适配器上，
而那里有同族的第二条竞态**：`nodejs/node#64529`「`Readable.toWeb()`：背压恢复期间被取消
→ 抛 uncaughtException(`ERR_INVALID_STATE`)」，**至今 OPEN**，两个修复 PR（#62773、#64766）
**均未合并**。错误码与「从 microtask 抛出、接不住」的形状，与本文档讨论的那条**完全一致**。

由此厘清两件事：

1. **用户那条崩溃属于哪一代码**：其栈第 2 帧是 `node:internal/deps/undici/undici:1465`，
   即 `ReadableStreamFrom`——那是 `new Response(<Node 流>)` 的形状，**早于** `fileBody`。
   所以报障用户跑的是 v0.20.1 之前的构建。
2. **今天 main 上的隐患不是 Race B 而是 Race C**。`fileBody` 是一次真诚但不彻底的修复：
   它换掉了 API，没换掉**「流的关闭权不在我们手里」这个根本形状**。

本轮的 `createOwnedFileStream` **两条都避开**：不经 undici，也不经 Node 适配器，
关闭权自始至终在我们手里。冲突按 P1 解：**删掉 `fileBody` 与随之无用的 `Readable` 导入**，不留并行版。

门岗随之补强：`node-stream-into-response` 现在**同时拦 `Readable.toWeb(`**，
判据从「用了哪个 API」改成「**流的关闭权在不在我们手里**」。
已验证该规则会拦下 main 的 `localProtocol.ts:95`（即 `fileBody` 那一行），本分支为 0。

> 附带的教训：§7b 里那次 A/B 对照，对照组用的是**我方基线**（`new Response(fs 流)`），
> 不是 main 当时已经在跑的 `toWeb` 版本。所以那次对照说明的是「Race B 在 macOS 上跑不出来」，
> 并未覆盖 Race C。这不改变结论（两条我们都不再走），但记下来免得日后误读那张表。

## 8. 后续（不在本轮）

- 给 undici 上游报 `ReadableStreamFrom` 无保护 close 的 issue（检索未发现已有上报）。上报后回填链接。
- `nodejs/node#64529`（`Readable.toWeb` 同族竞态）已 OPEN，无需另报；若上游合入修复，
  本仓的门岗规则可相应放宽——但「自己拥有流」本身仍是更稳的形态，不建议回退。
- Electron 31 EOL 升级：见 `2026-08-24-electron-31-to-43-upgrade.md`。
