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

## 不动项

- 「切片进节点堆叠而不是散落成 9 个节点」是 d5d4ba99 定的产品行为，本次不改。
- 取景框交互（可拖外框 + 网格线）不改。
- 其他节点类型、生成链路不碰。

## 顺手清掉

`cropGridGeometry.computeSplitLayout` + 其单测：切片改进堆叠后它就没有调用方了（d5d4ba99 遗留的并行版，P1）。

## 验收门

- 走查：同一张 4096² 图，主线程最长阻塞 < 400 ms；9 张切片都进堆叠；DOM 里零 `data:` URL。
- 五门全过（`pnpm run gates`）。
- 真机走查截图人眼对账（R13）。

## 回滚

单 commit，`git revert` 即回到旧管线（旧行为=卡但可用）。
