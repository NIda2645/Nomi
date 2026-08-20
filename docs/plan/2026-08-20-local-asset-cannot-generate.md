# 本地素材「点不了 / 传不上去」两条根因与修法（2026-08-20）

用户报两件事，看着是一件（「本地传上去的素材不行」），其实是两条独立根因，两条都实测复现过。

## 症状 1：全能参考只连了一段视频，↑ 按钮灰着点不动

**现状（file:line）**

- 判定：`src/workbench/generationCanvas/runner/generationRunController.ts:597-602`
  ```
  references.firstFrameUrl || references.lastFrameUrl ||
  references.referenceImages.length > 0 ||
  hasArchetypeArrayReferences(meta, archetype)
  ```
- `hasArchetypeArrayReferences`（`nodes/controls/archetypeMeta.ts:189-195`）**只读 meta**（手动上传的
  `referenceImageUrls/referenceVideoUrls/referenceAudioUrls`），看不见画布边。
- 而画布边来的视频/音频，被 `generationReferenceResolver.ts:203-209` 分流进
  `referenceVideos / referenceAudios` —— **判定里一个都没查**。

**根因**：同一个问题有三套口径，判定是唯一没升级的那套。

| 谁 | 读什么 | 看得见连线视频吗 |
|---|---|---|
| 显示（composer 缩略图）| `resolveReferenceSlots`（边 + meta 合并）| ✅ |
| 发送（`buildArchetypeInputParams:575-582`）| `references.referenceVideos` + meta | ✅ |
| **判定（`canRunGenerationNode`）** | `referenceImages` + **meta only** | ❌ |

回归点：`f3b573f0`（2026-06-25，B4「连线视频/音频参考分流喂对槽」）把视频从 `referenceImages` 里
拆出去修好了**发送**侧，判定侧没跟着改 —— 在那之前视频混在 `referenceImages` 里，判定误打误撞是通的。

**用户体验**：缩略图明明显示参考视频已经在了，按钮却灰着，tooltip 还说「需要先添加参考素材」——
让用户去做一件他已经做完的事。影响面不是 Seedance：**任何带 video_ref / audio_ref / source_video
槽的档案，只走连线不走上传，都点不动。**

**修法（P2 根因层）**：判定改用和显示/发送同一个真相源 `resolveReferenceSlots`（它的文件头就写着
「显示 / 生成 / 校验 / 对账 四处共用它，杜绝『显示读 meta、生成读边』的分裂」，判定是唯一没接进来的）。
video / image / audio 三个分支统一走一个 helper，删掉各自的并行判定（P1 加新必删旧）。

**结构保证**：不变量测试遍历所有档案 × 所有模式 —— 「有参考槽的模式，喂一条该槽 accept 的连线
就必须可生成」。新档案/新槽种漏接立刻红。

## 症状 2：素材上传失败(HTTP 413)

**现状**

- 抛出点 `electron/assets/localAssetFile.ts:150`；413 经 `vendorHttp.ts:82` 落 `unknown/retryable:false`
  → 终态、不重试（这一步对）。
- `electron/catalog/assetLocalization.ts:285` 选中的通道抛错就整条 run 死 —— **没有 try/catch、
  不换通道**。而 `resolveAssetIngestionWithFallback` 里排在后面的匿名链（litterbox 收任意文件）本来能接住。
  「fallback」今天只对**能力**（这家收不收 mp4）生效，对**失败**不生效。
- 全仓**没有任何尺寸预检**（grep 无 MAX/limit/byteLength 判断）——只能把整个文件传上去才知道装不下。
- `assetLocalization.ts:168-170`：`asset.bytes.toString("base64")` **无条件**先算一遍，upload-multipart /
  upload-stream 根本用不上它。一段 200MB 视频 = 主进程上同步造一个 267MB 字符串（R17 卡死一族同款）。
- 分类：`classifyError.ts:309-311` 只认匿名链包出来的 `所有免配置上传 host 都失败`；直连通道抛的
  裸 `素材上传失败(HTTP 413)` 落进 `unknown`。**实测输出**（vitest 探针）：
  `hint = 「可能是服务商临时故障或额度问题，建议稍等重试，或换一个模型。」` —— 与用户截图逐字一致。

**用户体验**：文件太大传不上去 → 被告知「服务商临时故障，稍等重试」→ 用户重试 N 次，每次都
把整个文件传上去再被拒，永远不会成功，也永远不知道真正原因是文件太大。

**修法**

1. 上传失败 → **按序换下一条能吃这个类型的通道**（终点是匿名链），全挂了才报错。
   不硬编码各家尺寸上限（查不到官方数、且各家会改）——用 413 本身当「这条装不下」的信号，derive 不 hardcode。
2. 全挂时的错误带上**素材名 + 实际大小 + 每条通道的失败原因**，413 单独成一类给出真话
   （「这段素材 XXX MB，可用的上传通道都装不下，请压缩后再放进来」），不再复用「稍等重试」。
3. `detectAssetUploadFailed` 扩到也认裸 `素材上传失败(HTTP` —— 上传失败永不再落 `unknown`。
4. base64 只在真要用它的策略（inline-base64 / upload-url）里算（R17 同族，顺手清）。

## 不动的东西

- 不改各家档案的槽声明、不改传输 body 形状。
- 不碰付费生成提交的重试策略（[[retry-must-not-wrap-paid-submit]] 铁律：只裹免费上传）。
- 不做视频转码/压缩（真要做是另一件事，先让错误说人话）。

## 实际结果（不变量把同类的另外两处也扫出来了）

判定改成「遍历本模式声明的槽」后，逐档案逐模式的不变量测试当场红了 26 条，暴露出同一根因的另外两处
**用户永远点不动**的功能：

| # | 现场 | 显示侧 | 判定侧（修前）| 发送侧（修前）|
|---|---|---|---|---|
| 1 | omni 只连一段参考视频（用户报的这条）| 缩略图已填 | ❌ 灰 | ✅ 发得出去 |
| 2 | 尾帧接力：视频 → i2v 节点的首帧槽 | 「已连接·待抽帧」| ❌ 灰 | ✅ 提交前抽帧 |
| 3 | HappyHorse 视频编辑：视频 → source_video 槽 | 槽已填 | ❌ 灰 | ❌ **键根本不发**（白拖）|

第 3 条还顺带修了发送侧的静默丢值。三条都不是「Seedance 的 bug」，是同一处判定漏槽种。

## 验收门

- ✅ 新增失败测试先红后绿：omni 只连一段视频 → 可生成。
- ✅ 不变量测试遍历所有 video 档案 × 模式 × **每种资产各一条边**（不能「收图就只喂图」——喂图那条
  恒绿，会把只连视频的 bug 盖过去；第一版就是这么写的，改成逐资产才扫出上面三条）。
- ✅ 上传换通道 / 413 文案 / 分类不再落 unknown 单测。
- ✅ 五门全过（`pnpm run gates`）。
- ✅ 真机走查 `tests/ux/omni-video-reference-gate.walk.mjs`：同一个按钮先证「零参考时是灰的」，
  连上视频后变活。**必须先点真实的「全能参考」tab 并断言 aria-pressed** —— 第一版没断言模式，
  截图里高亮的其实是「图生视频」，验的是接力那条路，是假绿。
