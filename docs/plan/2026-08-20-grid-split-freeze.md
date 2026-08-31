# 切图「九宫格」卡死 — 根因与修法

用户报告（2026-08-20）：**点击图片的切图功能，九宫格，直接卡死。**

## 现场取证（tests/ux/image-grid-split-freeze.walk.mjs，真机跑，非推测）

4096×4096 源图（8.5 MB PNG）、空项目、M 系列 Mac、点「确认切图」后：

| 量 | 值 |
|---|---|
| UI 完全无响应 | **≈1.6 s**（最长单次主线程空窗 782 ms） |
| 同步 PNG 编码 | **9 次 / 701 ms**（`canvas.toDataURL` 是同步的，压在主线程） |
| 源图重复加载 | **13 次**（每个 cell 都 `new Image()` 重新拉整张图） |
| `JSON.stringify` 经手 | **60 MB / 9 次大调用**（单次最大 11 MB） |

M 系列 Mac + 空项目是**最好**的情况。慢机器 PNG 编码 3–5×、项目里节点多时每次 store 写入还要全量存盘 —— 用户那边到 5–15 s 的「彻底卡死」完全合理。全程**零反馈**（没有进度、没有 loading），所以用户看到的就是「点完就死」。

## 为什么用户那边是「半小时」而不是 1.6 秒（第二根因，2026-08-20 追加）

用户反馈实际卡了约半小时。渲染层那 1.6s 解释不了——差的那一大截在**主进程**：

`electron/events/eventLogRepository.appendEvents` 整条写路径是**同步**跑在主进程里的。切图每次
`updateNode` 的 patch 都带着十几 MB base64 进来，于是每条事件都要：

1. `redactDeep` 对着 11MB base64 **逐个已知密钥 split/join**（配了几个 key 就扫几遍）+ 两遍全局正则
   （`sk-[A-Za-z0-9_-]{8,}` 这种字符类，正好贴着 base64 的字母表，是最坏输入）；
2. `sha256` 整串；
3. `fs.writeFileSync` 一份 11MB sidecar 全文。

十条事件 ≈ 上百 MB 同步 IO + 正则。**主进程被占死 = 整个 app（窗口、IPC、菜单）全冻**，不是某个面卡。
Windows 上再叠一层杀软扫新写入的文件，量级完全够到"半小时"。

修法（结构保证，不只是把燃料抽掉）：新增 `MAX_FIELD_BYTES = 256KB` 硬上限，
`stripOversizeStrings` 在 redact/sha256/sidecar **之前**先把超大字符串换成体积标记
（只看 length，不复制内容）。日志层从此不可能因为一个大字段拖死主进程——这条写在
本文件头注释里的承诺（「旁路观察，绝不打断产品主流程」）现在才真正成立。单测锁死。

## 根因（P2）

`useNodeImageEditing.handleEditConfirm` 这条路把三件重活全堆在主线程，且成本随格子数超线性涨：

1. **逐 cell 重新解码整张源图** —— `cropImageRegion` 内部 `new Image()`，9 个 cell = 9 次全图解码。
2. **逐 cell 同步 PNG 编码成 base64** —— `canvas.toDataURL()` 同步阻塞；9 张 ≈ 700 ms 起。
3. **把 9 段 base64 塞进 store，再写 1+9 次** —— 首次写入带全部 9 段 base64，随后 9 次落盘替换各带剩余的 base64。而每次 `updateNode` 都被 `emitCanvasGesture` 做一次 `JSON.parse(JSON.stringify(patch))`、同步压进撤销日志、再 IPC 发去事件日志。字节量 ≈ O(N²)：四视图 4 格能扛住，九宫格 9 格就过线。

一句话：**base64 图像数据进 store，是这类卡死的入口**；`adapters/persistNodeImage.ts` 的文件注释早就写明这条病（「图多即卡」），但切图路径只做了「事后替换」，没堵住「先塞进去」。

## 修法（改在根因层，让整类不再复发）

1. **解码一次**：源图只 `createImageBitmap` 一次，9 个 cell 从同一张位图上裁（`createImageBitmap(bitmap, sx, sy, sw, sh)`，裁剪本身也在主线程外）。
2. **编码不上主线程**：`OffscreenCanvas.convertToBlob()` 出 Blob，**全程不生成 base64**。
3. **先落盘再进 store**：Blob → File → `persistNodeImageFile` → `nomi-local://`，store 只写一次、只存门牌号。base64 仅在落盘失败时兜底（保持现有「不丢图」语义）。
4. **给反馈**：切图期间走节点既有的 `status:'running' + progress` 反馈（与抠图同一套，不新造 UI）。
5. **裁剪/旋转翻转同路收敛**：它们是同一条 base64 入口的另外两个门，一起走新管线，不留第二个入口（P1）。
6. **结构保证**：走查断言主线程最长阻塞 < 400 ms、切完 store 里零 `data:` URL —— 回归会直接报红。

## 切图长相改了（2026-08-20 用户拍板）

「切完藏进堆叠」改回「摊在画布上」，并加两件事：

- **摊成 N 个独立节点**：落点走 `computeSplitLayout`（纯函数+单测）+ `exactPosition` 信任落点，
  紧贴原图右侧。原图零改动。
  - **尺寸只有一个真相源**（用户「布局很乱」的根因）：首版布局自己按比例算格宽（地板 96px），
    可壳把每张卡的宽度钉在 `MIN_NODE_WIDTH=240` —— 实测按 129px 步距摆、卡片各渲染 240 宽，
    九张互相压掉 110px，糊成一团。现在 `computeSplitLayout` **不再决定尺寸**，只负责排布；
    尺寸由调用方拿 `resolveNodeVisualSize`（壳自己那套夹取规则）问出来。同时删掉
    useNodeImageEditing 里抄了一份的 MIN/MAX_NODE_WIDTH —— 抄一份就是错位的温床。
  - **切完自动 fit 视口**：九张摊开比原图占地大得多，复用批量落节点既有的 `requestCanvasFit`
    把整块揭出来（同 3D 录完 take 的做法），否则用户只看到左边两列。
- **逐步布局**：每切好一格就当场落一个节点，一张接一张冒出来——进度就是画面本身，不用另加进度条。
- **自动编组**：切完把这批瓦片编成一组，整组能一起选/拖/删/生成。
- **一次切图 = 一个 Cmd+Z 步**：9 个节点 + 编组挂同一 txn 并抑制各自的 barrier
  （`withCanvasGestureContext` 只包同步段——该模块明令禁止跨 await，异步间隙用户手势会插队串台）。
  连带修掉：图片加载后回写的派生尺寸 (`updateMediaDimensions`) 原先会自成一个撤销点，
  导致「刚建的一批节点按 Cmd+Z 撤掉的是某张图量了尺寸」——改成 `history:false`。

## 不动项
- 取景框交互（可拖外框 + 网格线）不改。
- 其他节点类型、生成链路不碰。

## 顺手清掉

`IMAGE_TRANSFORM_LABEL`：没有任何调用方的导出，且是硬编码中文（P1 + R15）。
（`computeSplitLayout` 一度是死代码，现在切图摊成节点又用回它，连单测一起留着。）

## 验收门

- 走查：同一张 4096² 图，主线程最长阻塞 < 400 ms；9 张切片都进堆叠；DOM 里零 `data:` URL。
- 五门全过（`pnpm run gates`）。
- 真机走查截图人眼对账（R13）。

## 回滚

单 commit，`git revert` 即回到旧管线（旧行为=卡但可用）。
