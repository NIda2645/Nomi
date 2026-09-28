# 镜头边界检测（shot boundary detection）选型调研 · 2026-09-21

> 状态：📎 **只调研，一行产品代码未动**，不碰 git。
> 硬纪律：每条事实都带**本次实际打开过的链接**；查不到的一律写「未查到」，不补脑补数字。
> 基线：分支 `claude/video-breakdown-clips-analysis-4c4bbf`，worktree `/Users/aoqimin/Desktop/Nomi/.claude/worktrees/video-breakdown-clips-analysis-4c4bbf`（只读）。

---

## 0. 一句话结论

**现役最佳且真正可部署的候选只有一个：TransNetV2（MIT，ClipShots F1 77.9 / BBC 96.2 / RAI 93.9）。**
但真正改变成本结构的不是它，而是一条本次实查出来的仓库事实：**Nomi 已经在跑 ONNX 了**——`onnxruntime-web@1.21.0` 是现役依赖，渲染层已有一条「按需下载权重（sha256 钉死）→ `nomi-local://runtime/ort/` 伺服 wasm → worker 里 `InferenceSession.create`」的完整链路（深度视频节点）。所以 B 档的包体增量**不是 45–90 MB 的 onnxruntime-node，而是 0 字节运行时 + 一个 31 MB 的按需下载权重**。

推荐 **C 档（两段式：ffmpeg 粗检 + 模型只复核可疑区段）**，理由与必须实测的数字见 §6、§7。

---

## 1. 我们现在站在哪（仓库事实 + 一份现成的本地真值）

### 1.1 代码事实

| 事实 | 位置 |
|---|---|
| 检测算法 = ffmpeg `select='gt(scene,0.1)',metadata=print:file=-` | `electron/video/detectShotCuts.ts:90-92`（`buildDetectFilter`） |
| 阈值地板常量 `SHOT_CUT_DETECT_THRESHOLD = 0.1`，前端滑杆只在**分数上过滤**、不重跑 ffmpeg | `electron/video/detectShotCuts.ts:26`，设计理由在 `:11-13` |
| 联系表共用同一 `select` 条件，保证第 i 格 ↔ 第 i 个切点 | `electron/video/detectShotCuts.ts:95-97`、`:134-144` |
| 切点上限 `MAX_CUTS = 120`，超了标 `truncated` | `electron/video/detectShotCuts.ts:32`、`:125` |
| 切点 → 镜头区间（N 切点 = N+1 镜） | `electron/video/shotTimeline.ts:43-62` |
| **时间被量化到 0.1 秒格子** `SHOT_TIME_PRECISION_SECONDS = 0.1` | `electron/shared/canvas/shotTime.ts:19`、调用点 `electron/video/shotTimeline.ts:44,51` |
| 每镜抽 3 帧、两端各内缩 8%「避开转场帧（切点处常是叠化/黑场）」 | `electron/video/shotTimeline.ts:126-136` |

**已有的 ONNX 链路（本次调研最关键的一条发现）**：

| 事实 | 位置 |
|---|---|
| `onnxruntime-web` 是现役生产依赖，版本 `1.21.0` | `package.json` dependencies |
| 推理跑在渲染层 web worker，执行器 **WebGPU（jsep）**，模型 Depth Anything V2 Small fp16 | `src/workbench/generationCanvas/videoDepth/videoDepth.worker.ts:1-28` |
| 权重**不进安装包**、首次用时下载、URL 钉 HF commit sha、`sizeBytes` + `sha256` 精确钉死、Apache-2.0 | `electron/shared/canvas/videoDepthModels.ts:35-51` |
| 下载/校验/原子落盘的唯一 owner（与 whisper sidecar 共用） | `electron/downloads/verifiedAssetCache.ts`（见 `electron/video/depthVideoModelCache.ts:1-11` 的迁移说明） |
| ort 的 wasm 经 `nomi-local://runtime/ort/<file>` 白名单伺服（打包态 `file://` fetch 跨源被拒，必须走协议） | `electron/protocol/localRuntimeAssets.ts:1-36` |
| 本机已随包的 ort wasm：`ort-wasm-simd-threaded.wasm` **12.67 MB**、`ort-wasm-simd-threaded.jsep.wasm` **23.91 MB** | 本次 `ls -la node_modules/onnxruntime-web/dist/*.wasm` 实测 |
| 权重白名单键目前**只认深度那一条**（`videoDepthModelByFileName`） | `electron/protocol/localRuntimeAssets.ts:14-17` |
| 深度那条**故意不做 wasm 回退**（fail-closed，理由：静默降级把 4 秒变十几分钟） | `videoDepth.worker.ts:10-14` |

**whisper.cpp sidecar 那套可复用的分发套路**（§3 的「照抄对象」）：`electron/shared/localSpeech/localSpeechAssets.ts`
- 引擎二进制**不进安装包**、首次使用才下载（`:1-10` 文件头四条硬约束）
- **引擎钉 release tag、权重钉 HuggingFace commit sha**，不跟 `latest`/`main`——理由写死在 `:20-30`（上游每天 `bNNNN` 构建，升一版就可能静默改变输出而我们 diff 是空的）
- 压缩包本身校验过**不等于**里面的东西没被换 → **逐成员文件 sha256**（`LocalSpeechEngineMember`，`:100-110` 附近）
- 平台不支持 = **显式缺条目**（`platformKey` 没有这一条就是 unsupported，不是 `undefined`，R17）
- `gpuAccelerated` 必须是**实测事实**（mac Metal 11.5× 实时 vs Windows CPU 约 1× 实时，同一段音频 10.4s vs 115.1s）
- 档位表必须是**实测出来的**（CER/体积/速度三列），不摆没有数字支撑的选项
- 门岗：`scripts/check-supply-chain-pins.mjs` + `docs/engineering/supply-chain-pins.json`（带到期日的欠账，到期即红）

### 1.2 一份现成的人工真值（`…/scratchpad/reelbench-skills/demo-report/shots.json`）

素材：`demo-video.mp4`「啥是AI」，202.9s / 30fps / 1680×720 / h264。参数 `sceneThreshold 0.15`、`minShotSeconds 0.3`。

本次实算（`seedCuts` = ffmpeg 出的、`manualCuts` = 人工补的、`shots[].start` = 最终采用的）：

| 量 | 值 | 算法 |
|---|---|---|
| ffmpeg 出的切点 `seedCuts` | 46 | — |
| 被人工**丢弃**（判为假阳性） | 4 → `1.4, 46.03, 46.13, 46.2` | seedCuts 里没出现在 `shots[].start` 的 |
| 人工**补**的切点 `manualCuts`（漏检） | 10，**全部被采用** | — |
| 最终镜头数 | 53 | `shots.length` |
| **precision** | 42/46 = **0.913** | |
| **recall** | 42/52 = **0.808** | |
| **F1** | **0.857** | |

两个形状比数字更有用：

1. **假阳性是成簇的、且长得就是「闪光/快剪」**：45.63 / 45.97 / **46.03 / 46.13 / 46.2** / 46.73 —— 1.1 秒内 6 个切点，其中 3 个被人判为假。这正是 PERSIST 点名的「瞬时脉冲被当成持久状态改变」那一族。
2. **漏检不是随机撒的，是聚在片尾**：10 个 `manualCuts` 里 **7 个落在 183.23–199.73s**（全片 202.9s，即最后 20 秒）。片尾多半是快切蒙太奇 / 低对比叠字段落——**这是一个结构性盲区，不是噪声**。

⚠️ **这份真值的已知偏差（用它下结论时必须说）**：`manualCuts` 是人**看着 seedCuts 的结果去补**的，不是独立逐帧标的，所以真实 recall **只会比 0.808 更低**（没被注意到的漏检不在里面）。它足够当「A 档改进有没有效」的相对判据，**不足以**当「我们的 F1 是多少」的绝对数字。

---

## 2. 现役盘点（问题 1）

### 2.1 总表

| 方案 | 性质 | 公开基准 F1（出处见下） | 渐变转场 | 许可证 | 权重体积 | 维护状态（本次实查） |
|---|---|---|---|---|---|---|
| **TransNetV2** | 神经网络（膨胀 3D-CNN + 帧相似度分支） | ClipShots **77.9** / BBC **96.2** / RAI **93.9** | **训练时 50% 样本就是 dissolve**，明确为渐变设计 | **MIT** | ONNX fp32 **31.25 MB**（TF SavedModel 主文件 5.93 MB + variables，走 Git LFS） | **1043 star**，`pushed_at` **2023-12-04**（近 2 年无提交，但也未 archive；属「稳定/停更」） |
| **AutoShot** | 神经网络（在 3D ConvNet/Transformer 空间做 NAS） | SHOT **84.1** / ClipShots **78.7** / BBC **97.1** / RAI **95.5**（均 > TransNetV2） | 论文未按转场类型分列 | 仓库 **MIT** | `ckpt_0_200_0.pth`，**只托管在百度网盘**，大小未标 | **260 star**，`pushed_at` **2023-04-18**（建仓后一周即停更） |
| **PERSIST** | 神经网络（FiLM 调制正弦表示网络 + 双速率时序骨干） | README **未给 F1**（只说在 ClipShots / BBC / AutoShot / HISTORIAN 上评） | 主打就是压闪光/叠字假阳性 | **Apache-2.0**（内含改编自 TransNetV2 的部分仍 MIT） | 权重在 **GitHub Releases**（3 个 seed 的 checkpoint），大小未标 | **1 star**，`pushed_at` **2026-09-04**（2026-08-28 建仓，极新极冷） |
| **PySceneDetect** | **算法不是模型**（Python + OpenCV） | BBC：Adaptive **91.59** / Content **86.69** / Hash **83.10** / Histogram **79.96** / Threshold **0.11**；AutoShot：Adaptive **73.86** / Content **69.26** / Hash **64.84** / Histogram **57.82** | `detect-threshold` 专为**淡入淡出**（平均亮度）；其余检测器官方文档明写 not optimized for fades/dissolves | **BSD-3-Clause** | 0（无权重） | **5193 star**，`pushed_at` **2026-09-21**（今天，活跃） |
| **ffmpeg `scdet`** | 算法（滤镜） | 无公开 F1 | 无（同 `select=scene`） | LGPL/GPL（随 ffmpeg） | 0 | 随 ffmpeg |
| **ffmpeg `select=gt(scene,…)`**（我们现在用的） | 算法（滤镜） | 无公开 F1；**我们自己素材上 F1 0.857（见 §1.2，带偏差）** | 无 | 同上 | 0 | 随 ffmpeg |

### 2.2 `scdet` 和我们现在用的 `select=gt(scene,…)` 到底差在哪（问题 1 末项）

本次读的是 ffmpeg 源码，不是二手教程：

- **`select` 的 `scene`**（`libavfilter/f_select.c`，`get_scene_score()`）：`mafd = sad / count / (1 << (bitdepth-8))`，`scene = av_clipf(FFMIN(mafd, diff) / 100., 0, 1)`，`diff = |mafd − mafd_prev|`。`prev_picref` 在 `get_scene_score()` 末尾**对每一帧无条件更新**（不是只在被选中的帧上更新）——所以分数确实是相邻帧之间的，这一点没问题。
- **`scdet`**（`libavfilter/vf_scdet.c`）：`mafd = (sad × 100) / count / 2^bitdepth`，`score = clip(min(mafd, |mafd − mafd_prev|), 0, 100)`。选项 `threshold`（别名 `t`，默认 **10.0**，范围 0–100）与 `sc_pass`（别名 `s`，默认 0）。metadata 键 **`lavfi.scd.mafd` / `lavfi.scd.score` 每帧都写**，`lavfi.scd.time` **只在超阈值时写**。

**结论（两条，别混）**：

1. **算法是同一个**（同样的 MAFD + min(mafd, diff)）。换成 `scdet` **不会**提高准确率——这一条要先说清楚，免得把「换个滤镜」当成修复。
   换算（**从两份源码推的算术，未实测校验**）：8-bit 下 `scdet_score ≈ scene × 39.06`。即我们的 `scene 0.1` ≈ `scdet 3.9`；`scdet` 默认 `10` ≈ `scene 0.256`。
2. **但 `scdet` 给的东西不一样，而那正是我们缺的**：它把 **每一帧** 的 score/mafd 都写进 metadata，而 `select=gt(scene,X)` 只在**过了阈值的帧上**才让 `metadata=print` 打印。拿到**全帧分数曲线**之后，A 档里那些「自适应阈值 / 滑窗累计差抓叠化 / 闪光簇合并 / 切点精修」才有输入可用——现在我们**连原始曲线都没有**，只有一串过阈值的点。**这是 A 档真正的第一刀。**

---

## 3. 桌面端可行性（问题 2 · 重点）

### 3.1 ONNX 移植可不可靠

| 路径 | 谁做的 | 有没有验证过与原版一致 | 许可证 | 判断 |
|---|---|---|---|---|
| **官方 PyTorch 移植** `inference-pytorch/` | **原作者本人**（soCzech） | **有**：README 原话 "It should produce identical results as the Tensorflow version"；`convert_weights.py --test` 跑 10 个随机 batch，用 `np.isclose(...).mean()` 报「single / many 两个头各有多少比例的预测吻合」 | MIT（仓库根有 LICENSE） | ✅ **唯一可信的起点**。注意 `--test` 报的是**比例**（示例输出 99.2% / 98.7%），**不是逐元素严格相等**——这是我们要自己复核的第一个点 |
| **现成 ONNX** `huggingface.co/elya5/transnetv2` | 第三方 `elya5`，README 自称由 `Sn4kehead/TransNetV2` 转 | **没有**任何等价性说明 | MIT（HF 标注） | ⚠️ 文件 **31,250,929 字节**、`lastModified` 2025-01-06、**downloads 0 / likes 1**。零下载量 = 零社区验证。**不建议直接拿来用**，最多当「体积/输入规格」的参考 |
| **我们自己导出** | 我们 | 由我们做 | MIT（源自官方权重） | ✅ **推荐**：官方 PyTorch 权重 → `torch.onnx.export` → 用同一批输入逐元素比对 TF/PyTorch/ONNX 三方。这是一次性的**开发机**动作（需要 Python/torch），产物是一个我们自己 sha256 钉死的 .onnx，与 depth / whisper 完全同一套分发纪律 |

**权重可得性**：官方 TF SavedModel 就在仓库里，走 **Git LFS**（`inference/transnetv2-weights/saved_model.pb` 是 LFS 指针，`oid sha256:8ac2a52c…`、`size 5933260`）。仓库根有 LICENSE（1072 字节，GitHub 判定 **MIT**）。
⚠️ **未查证**：权重的训练数据含 ClipShots / IACC.3（TRECVID），**IACC.3 的数据使用条款是否对「训练出来的权重再分发」有额外约束，本次未查**。这是商用前必须补的一条。

### 3.2 输入规格（实查，不靠记忆）

- **分辨率 48×27**（宽×高），官方 inference README 写的张量形状是 `[n_frames, 27, 48, 3]`，`dtype: np.uint8`、**RGB 不是 BGR**。
- **窗口 100 帧**：论文原话是网络吃 100 帧序列，**但测试时只取中间 50 个预测**（"only the middle 50 predictions are considered for testing due to limited temporal context"）→ 实际是 **100 帧窗口、50 帧步长、2× 重叠**。
- 输出**两个头**：single-frame-per-transition 与 all-frames-per-transition，逐帧一个 logit，要过 sigmoid。
- 第三方 ONNX 的 README 也说「100 张 48×27」，与官方对得上。

### 3.3 在 Electron 里怎么跑——**两条路，结论是别走 onnxruntime-node**

| | **A: 复用现役 `onnxruntime-web`（渲染层 worker）** | **B: 新引入 `onnxruntime-node`（主进程）** |
|---|---|---|
| 运行时包体增量 | **0 字节**（`ort-wasm-simd-threaded.wasm` 12.67 MB 已随包） | mac arm64：`libonnxruntime.1.30.0.dylib` **44.59 MB** ×（包里有 `.1.30.0.dylib` 与 `.1.dylib` 两份同尺寸文件）+ binding 0.27 MB；win32 x64：`onnxruntime.dll` **28.75 MB** + `DirectML.dll` 18.53 MB + `dxcompiler.dll` 17.99 MB + `dxil.dll` 1.51 MB + binding 0.30 MB ≈ **67 MB**。整包 `dist.unpackedSize` **301,068,136 字节**（含全部平台） |
| 执行器 | **必须 wasm(CPU)**，不能指望 WebGPU——TransNetV2 是 **3D 卷积**，而官方文档原话：「All ONNX operators are supported by WASM but only a subset are currently supported by WebGL, WebGPU and WebNN」；WebGPU 侧 5 维 Conv 长期报 "Only Conv2d or Conv1d are supported"（3D ConvTranspose 支持是 PR #32688 才加的） | CPU EP（全算子） |
| 已有基建 | 全有：`nomi-local://runtime/ort/` 白名单伺服、`verifiedAssetCache` 下载校验、worker 协议、CSP 条目 | 全要新建，且 Electron 打包要处理 `asarUnpack` + 显式 pin 原生绑定路径（社区已知坑：asarUnpack 是**拷贝**不是移动，未 pin 的 `require` 会静默解析到 asar 内那份副本） |
| 帧从哪来 | ffmpeg 解码需跨到渲染层（或主进程解好再传 buffer） | ffmpeg 在主进程，**帧喂给模型是同进程**，管线最短 |
| 平台支持 | 随 Electron，mac arm64 / win x64 都有 | 包里 darwin arm64 / linux x64+arm64 / win32 x64+arm64 都有 binding |

**推荐路径**：**ffmpeg 在主进程解码 → 模型也在主进程**这条最短，但代价是 onnxruntime-node 的 45–67 MB 包体；**复用 onnxruntime-web 则包体 0**，代价是要把 48×27 的帧 buffer 从主进程送进渲染层 worker。
48×27×3 字节/帧 = **3.9 KB/帧**，200 秒 30fps 全片 = 6000 帧 = **23 MB 裸数据**（可 transfer，不拷贝）。**23 MB 一次性传输 vs 45–67 MB 永久包体增量 —— 选前者。**
→ **结论：走 A（复用 onnxruntime-web + wasm CPU EP），不引 onnxruntime-node。**

喂帧管线（可直接接现有代码）：
```
ffmpeg -i <file> -vf scale=48:27 -pix_fmt rgb24 -f rawvideo -   # 一趟解码，stdout 裸流
  → 主进程按 3888 字节切帧
  → postMessage(ArrayBuffer, [transfer]) 给 worker
  → ort.Tensor('uint8'|'float32', [1,100,27,48,3]) 按 50 帧步长滑窗
```
注意：这与现在的**两趟** ffmpeg（检测 + 联系表）是可以合并的——联系表那趟仍需原分辨率抽帧，检测那趟被这趟替换。

### 3.4 CPU 推理速度——**这是最大的未知数，必须我们自己测**

- **未查到任何权威出处**的 CPU 速度数字。搜到的「CPU 单核 ~200 fps」「250 fps on RTX 2080Ti」「200–250 windows/s on V100」全部来自 `emergentmind.com` 这类 **LLM 生成的摘要站**，原论文（arXiv 2008.04838）与官方 README 里**都没有速度小节**——本次逐页核过。**不采信、不引用。**
- 唯一可用的间接量：**AutoShot 论文给出 TransNetV2 = 41 GMACs**（AutoShot@F1 37、AutoShot@Precision 30）。论文**未说明这 41 GMACs 的计量单位是「每窗口」还是「每帧」**（本次未查到）。
  - 若是**每 100 帧窗口**：200 秒 30fps = 6000 帧 → 120 个窗口 → **4.92 TMACs ≈ 9.8 TFLOPs**。wasm SIMD 多线程在 M 系列上按 20–60 GFLOPS 估 → **约 160–500 秒**。这个量级**会毁掉体验**，必须实测后才能定档。
  - 若是**每帧**：完全不可行。
- ⚠️ 因此 §7 的实测方案里，**「TransNetV2 在 wasm CPU 上处理 1 分钟视频要几秒」是 B/C 两档的生死判据**，在量出来之前不许写方案、不许拍板。

### 3.5 onnxruntime-web 版本

我们钉在 `1.21.0`，npm 上 `latest` 已是 **1.30.0**（MIT，`dist.unpackedSize` 144,618,540 字节）。
本次**没有**找到「必须升级才能跑 TransNetV2」的证据——wasm CPU EP 全算子支持，3D Conv 不是问题。**建议不为这件事升版**（升 ort 会同时动到深度与抠图两条现役链路，按 R22 那是全维度验证）。

---

## 4. 同类产品怎么做（问题 3）

| 产品 | 实际用的是什么 | 出处（本次实读） |
|---|---|---|
| **LosslessCut** | `select='gt(scene,${minChange})',metadata=print:file=-:direct=1`，正则 `/^frame:\d+\s+pts:\d+\s_time:([\d.]+)/` 解析 | `src/main/ffmpeg.ts` 的 `detectSceneChanges`（raw 实读）。同文件还有 `blackdetect` / `silencedetect`，即「黑场/静音」是**另外两个独立探测器**，不是塞进 scene 里 |
| **Kdenlive** | `-filter:v "select='gt(scene,%1)',showinfo" -fps_mode vfr -f null -`，解析 `[Parsed_showinfo` 行里的 `pts_time:`。用户填的是**百分比**，代码里 `threshold / 100.` 传给 ffmpeg；默认值取自 `KdenliveSettings::scenesplitthreshold()` | `src/jobs/scenesplittask.cpp`（invent.kde.org raw 实读）。官方手册推荐阈值 **15%–25%**（= scene 0.15–0.25） |
| **PySceneDetect** | 自己的 OpenCV 检测器族，**不调 ffmpeg 的 scene**；默认推荐 `AdaptiveDetector`（滚动均值） | scenedetect.com 文档 + `benchmark/README.md` |
| **DaVinci Resolve**（闭源） | 逐帧像素对比 + **置信度曲线图 + 可拖的紫色阈值线**，用户确认后才 `Add Cuts to Media Pool` | elements.tv 对比评测（二手；**官方手册镜像站本次 404，未读到一手原文**） |
| **Premiere Pro Scene Edit Detection**（闭源） | 自动分析后加剪辑点/标记，**没有阈值可调** | 同上 |
| **VideoBricks**（唯一查到的「桌面工具 + TransNetV2」） | TransNetV2 ONNX（README 原话 `transnetv2.onnx -- Pre-exported ONNX model (~30 MB, committed)`），但**通过打包一个 Python 运行时跑**（Windows 安装包里塞约 90–95 MB 的 Python），`transnet_detect.py` 走 onnxruntime/PyTorch | GitHub API + raw README。**1 star / AGPL-3.0 / TypeScript(Tauri)**，`pushed_at` 2026-08-30 |
| **npm 生态** | **不存在** TransNetV2 的 npm 包（`registry.npmjs.org` 搜 `transnet` 返回 3 个完全无关的包） | npm registry search API |

**三条可直接用的判断**：

1. **开源编辑器全都停在同一条算法上**——LosslessCut 与 Kdenlive 用的就是我们那一行 `select='gt(scene,X)'`，一字不差。所以「大家都这么做」为真，但这**不是**它够用的证据，只是它够便宜的证据。
2. **闭源大厂也挡不住叠化**：elements.tv 实测原话——Resolve 与 Premiere **"both were unable to detect an edit with a dissolve transition effect"**；Resolve 在抽象素材的 6 个跳切里只认出 1 个、还多报 2 个。**我们的问题 ① 是全行业的**，这既降低了「我们很差」的焦虑，也抬高了「做对它」的差异化价值（D2）。
3. **Resolve 的产品答案不是更准的模型，是可看的置信度曲线 + 可拖的阈值线 + 人工确认**。我们已经有滑杆和联系表，**缺的正是那条曲线**——而 §2.2 说了，拿到曲线只需要把 `select` 换成 `scdet`。这是 A 档里**成本最低、用户最看得见**的一刀。
4. 唯一把 TransNetV2 塞进桌面 app 的先例（VideoBricks）是**打包 Python** 解决的，而**我们不需要**——我们已经有 ort。这既是「可行」的证据，也是「别照抄它的做法」的提醒。

---

## 5. 不换模型能拿到多少（问题 4）

回顾三个已知问题：① 叠化/淡入淡出漏刀 ② 闪光/手持/叠字误切 ③ 切点比真实早 2–3 帧。

| # | 便宜改进 | 做法 | 能解 | 依据 | 代价/风险 |
|---|---|---|---|---|---|
| A1 | **换 `scdet`，拿到全帧分数曲线** | `select` → `scdet=threshold=0`（或低阈），读每帧的 `lavfi.scd.score` / `lavfi.scd.mafd` | **①②③ 的前置条件**（本身不解任何一条） | `vf_scdet.c`：score/mafd **每帧**写 metadata | 输出量从「几十行」变成「每帧一行」，6000 帧级别的解析要注意（仍是一趟解码）。**注意：算法没变，别当成修复** |
| A2 | **自适应阈值**（滚动均值比值） | 对 A1 的曲线做 PySceneDetect `AdaptiveDetector` 那套：`window_width=2`（前后各 2 帧均值）、`adaptive_threshold=3.0`（比值）、`min_content_val=15.0` 兜底 | **②**（运镜、手持） | 官方文档原话：滚动均值 "can help mitigate false detections in situations such as fast camera motions"；BBC 基准上 Adaptive **91.59** vs Content **86.69**，AutoShot 上 **73.86** vs **69.26** | 纯 TS 重写约百行，零依赖。两遍处理（要先有整条曲线，A1 已经给了） |
| A3 | **最短镜长 + 闪光簇合并** | `min_scene_len`（PySceneDetect CLI 默认 **0.6s**，API 默认 15 帧）+ `ContentDetector` 的 `filter_mode=Mode.MERGE` | **②**（§1.2 那个 46 秒附近的 6 连簇正是这一族） | PySceneDetect 文档 + 我们自己的真值 | 会**误伤真快剪**（MV/广告 0.3s 镜头合法——`shots.json` 里最短镜就是 **0.33s**）。所以阈值必须可调，且**不能低于**素材真实最短镜 |
| A4 | **滑窗累计差抓叠化** | 在 A1 的 mafd 曲线上算「N 帧窗口内的累计变化」而不是「逐帧变化」：叠化的特征是**每帧都只变一点点、但 10–20 帧累计变很多**；或用首尾帧直接比（`frame[t]` vs `frame[t+N]`） | **①**（部分） | 机理成立且是文献里的标准做法；**但我本次未查到任何公开的 F1 数字证明纯启发式能把叠化做到可用**——这是**未验证**的 | 会与慢摇/推拉混淆（那也是「每帧变一点、累计变很多」）。**这条最可能做半天没效果，必须先在真素材上验** |
| A5 | **淡入淡出黑场单独探测** | 加一路 `blackdetect`（LosslessCut 就是这么分的），黑场进出点当切点候选 | **①的子集**（fade-to-black，不含 cross-dissolve） | LosslessCut `src/main/ffmpeg.ts` 的 `blackDetect` | 只覆盖「淡到黑」这一种，覆盖不了 A→B 的叠化 |
| A6 | **切点精修到帧** | 粗检拿到 t 后，在 t±N 帧窗口内用**全分辨率**逐帧差取 argmax | **③** | PySceneDetect 逐帧处理、基准按 **tolerance=0 帧精确**匹配，说明帧精确是可达的 | 需要第二趟局部解码（`-ss` seek，每个切点一次）。切点多时要注意墙钟 |
| A7 | **先别修 ③，先量它** | 见下 | **③** | | |

### 关于 ③「早 2–3 帧」的根因，本次的判断

**我没有测量，所以下面是候选不是结论**（D3：叫某东西是 bug 前先搞懂现有设计为什么这么写）。按可能性排：

1. **我们自己的 0.1 秒量化**（`electron/shared/canvas/shotTime.ts:19`）。0.1s 在 30fps 下 = 3 帧，`Math.round` 引入 **±0.05s = ±1.5 帧** 的误差。文件头自己写着「0.1s ≈ 2.5–3 帧」。**这是一个必然存在的贡献项，且完全在我们手里**。但它是**对称的**，解释不了「系统性偏早」。
2. **叠化让分数峰值落在转场中点**：ffmpeg 的 scene 分在 cross-dissolve 上是个缓坡，峰值在中间。一个 6 帧的叠化 → 报出来的切点比「新镜真正开始」早约 3 帧。**这条能解释「系统性偏早」，而且和问题 ① 是同一个根因的两面。**
3. **ffmpeg 侧本身不早**：`f_select.c` 的 `prev_picref` 对每帧无条件更新，`select` 放行的就是新镜的第一帧，`metadata=print` 打的就是那一帧的 `pts_time`——**硬切上没有结构性的早 2–3 帧**。

**所以 ③ 很可能不是一个 bug，是两个**：一个是我们的量化（确定存在、好修）、一个是叠化的峰值位置（= ①）。
**行动**：先做 A7——在 `quantizeShotSeconds` 之前把**原始 pts_time** 也留一份，拿真素材逐个切点和人眼标注比，把「早几帧」分成「量化造成的」和「转场造成的」两笔账。**在这一步之前不要改 `SHOT_TIME_PRECISION_SECONDS`**，因为那个常量是 2026-09-12 用户亲自提的需求（「秒数也离谱」）的解，动它要先有数字。

### A 档的天花板（诚实标注）

| 对照 | F1 |
|---|---|
| PySceneDetect `AdaptiveDetector` @ AutoShot 短视频集（tolerance=0） | **73.86** |
| TransNetV2 @ 同一个 SHOT/AutoShot 集 | **79.9** |
| AutoShot @ 同集 | **84.1** |

即：**把 A 档做到 PySceneDetect 官方推荐配置的水平，在短视频素材上离 TransNetV2 仍差约 6 个点、离 AutoShot 差约 10 个点。**
⚠️ 跨源可比性警告：PySceneDetect 的基准是 **tolerance=0（帧精确）**，AutoShot/TransNetV2 论文用的是各自领域的标准评测协议（容差未逐条核对）。**这三个数放在一张表里只能读「方向」，不能读「差值」。**

---

## 6. 三档建议（问题 5）

| | **A · 只做 ffmpeg 侧便宜改进** | **B · TransNetV2 ONNX 内置（全量跑）** | **C · 两段式：ffmpeg 粗检 + 模型只复核可疑区段** |
|---|---|---|---|
| **用户看到的变化** | 误切明显变少（闪光簇不再刷屏）；多出一条**置信度曲线**，滑杆从「盲拖」变成「看着拖」（Resolve 同款）；叠化**仍大概率漏** | 叠化能认出来、闪光误切大降；但**第一次用要下 31 MB**，且处理时间从「几秒」变成「几十秒～几分钟」（量级未测） | 常见片子和现在一样快；只有「可疑段」才掏模型（含首次 31 MB 下载）。叠化能认，闪光靠模型复核压掉 |
| **代价** | 纯 TS，约 300–500 行（曲线解析 + 自适应阈值 + 簇合并 + 精修）。包体 0，无新依赖，无新下载 | 复用现役 ort：运行时包体 **0**，新增 31 MB 按需下载权重 + 一次开发机 ONNX 导出 + 一条权重清单 + 白名单 owner 扩展（`localRuntimeAssets.ts` 现在只认深度那一条）+ 供应链钉子 | A 的全部 + B 的全部 + **一条「哪些区段算可疑」的判据**（新的、需要自己定义和验证的东西） |
| **风险** | **天花板低**：①（叠化）大概率仍解不掉；A4 那条启发式**我查不到任何公开证据证明它可用** | **速度未知**且可能致命（§3.4）；TransNetV2 仓库 **2023-12 起无提交**；wasm CPU 单线程/多线程差异大；现成 ONNX 不可信、得自己导 | **最复杂**：两套判据要保持一致（现在 `select` 与联系表共用同一条件才保证第 i 格 ↔ 第 i 个切点，见 `detectShotCuts.ts:9,134`——加一层模型会**破坏这个不变量**，索引对齐要重新设计）。「可疑」判错就等于没上模型 |
| **P1 影响** | 无并行版（替换 `buildDetectFilter`，旧的同 commit 删） | 有两条路径的风险 → 必须明确**模型可用时就只走模型**，不留 ffmpeg 兜底逃生口 | 天然两条路径，**必须在契约层写清「谁是唯一真相源」**，否则就是 P1 违规 |

### 推荐：**先 A（本轮就做），把 C 当目标形态，B 只作为 C 的内核**

**为什么（底层逻辑，D6）**：

1. **A 是 B/C 的前置，不是 B/C 的替代。** 换 `scdet` 拿到全帧曲线这一刀，A 档要它（自适应阈值的输入）、C 档更要它（「哪段可疑」只能从曲线上读出来）。它还顺手给用户一条 Resolve 同款的置信度曲线——**用户当场看得见的变化，成本却最低**。先做它，任何一档都不浪费。
2. **B 的生死数字还没量。** §3.4 那个 41 GMACs 连单位都没查到出处。在「1 分钟视频要跑几秒」量出来之前推 B，就是拿用户的等待时间赌。
3. **C 才是符合 D1/D2 的形态。** 用户的真实摩擦是「叠化那几刀漏了、闪光那几刀多了」，不是「全片检测不够准」——全片 95% 的硬切 ffmpeg 已经做对了（我们自己素材上 precision 0.913）。为 5% 的难段付 100% 的算力，是从实现出发不是从摩擦出发。C 把模型用在它唯一比 ffmpeg 强的地方。
4. **结构上 C 也更稳**：模型停更（2023-12）、权重许可有未查证的尾巴、wasm 速度未知——把它放在「复核」位而不是「主检测」位，任何一条出问题都只是退回今天的行为，不是功能挂掉。

**用户要权衡的那一个核心东西（一句话）**：**是要「所有片子都慢一点但叠化不漏」（B），还是「绝大多数片子和今天一样快、只有难段慢下来」（C）**。我的判断是 C，但这取决于 §7 第 1 项那个速度数字——如果 wasm 上 1 分钟视频只要 2–3 秒，B 的简单性就赢了，C 那套「可疑判据」的复杂度不值得。

---

## 7. 哪些数字必须我们自己在真实素材上测（+ 最小实测方案）

### 7.1 必须实测、不实测就不许拍板的 6 个数

| # | 要量什么 | 为什么外部数字不够 | 决定什么 |
|---|---|---|---|
| **1** | **TransNetV2 在 onnxruntime-web / wasm CPU 上，处理 1 分钟 30fps 视频要几秒**（mac arm64 + Windows x64 各一遍，单线程/多线程各一遍） | 全网**零权威出处**；41 GMACs 连单位都查不到 | **B/C 的生死**。whisper 那条的先例：同一段音频 mac 10.4s / Windows 115.1s，**差一个数量级**——不分平台测等于没测 |
| **2** | **我们自己导出的 ONNX 与官方 TF 的逐元素差** | 官方 `--test` 报的是 `np.isclose` 的**比例**（99.2%/98.7%），不是严格相等；第三方 ONNX 零验证 | ONNX 移植可不可信 |
| **3** | **ffmpeg 现役方案在我们真素材上的 P/R/F1**（不是 `shots.json` 那份有偏差的） | §1.2 的真值是「看着 seedCuts 补的」，recall 只会更低 | A 档改进有没有效的**基线**。没有干净基线，A 档改完只能说「感觉好了」 |
| **4** | **③「早 2–3 帧」里，量化占几帧、转场占几帧** | 本次只有推理没有测量 | 决定要不要动 `SHOT_TIME_PRECISION_SECONDS`（那是用户亲提需求的解，不能凭感觉动） |
| **5** | **A4（滑窗累计差抓叠化）到底能抓到几成叠化、误报几个慢摇** | 查不到任何公开 F1 支撑这条启发式 | A 档能不能宣称解决了 ① |
| **6** | **31 MB 权重的首次下载在用户网络下要多久** | 深度那条是 50 MB，已有真实体感可对照 | 首次使用的引导文案与进度条要不要单独设计 |

### 7.2 最小实测方案

**真值素材（4 条，各覆盖一个失效族——直接对上 `check:real-media-fixture` 的四类真素材要求）**：

| 编号 | 素材 | 为什么要它 | 真值怎么来 |
|---|---|---|---|
| **F1** | `…/scratchpad/reelbench-skills/demo-report/demo-video.mp4`（「啥是AI」202.9s，已在手） | **唯一已有人工标注**，含闪光簇（46s 附近）与片尾漏检簇（183–200s） | `shots.json` 的 `seedCuts` / `manualCuts` / `shots[].start` **已经是现成的三层真值**：`manualCuts` = ffmpeg 漏的、被丢弃的 4 个 seedCut = ffmpeg 多报的。**先把它补成独立逐帧标注**（只需重标片尾 20 秒和 44–48 秒两段，其余抽查） |
| **F2** | 一条**带 cross-dissolve** 的片子（叠化、白闪转场） | ①的专用夹具。**现在一条都没有**，所以我们永远量不到 ① | 人眼逐帧标「叠化起点 / 叠化终点 / 判定为切点的那一帧」——注意这是**三个数**不是一个，「切点在哪」本身就是个产品定义问题（取起点还是中点？），要先拍板 |
| **F3** | 一条**广告片**（闪光、叠字、快剪 <0.5s 镜） | ②的专用夹具。`deconstructVideo.ts` 的提示词写的就是「你在拆解一条广告片」——主场景却没有夹具 | 同上 |
| **F4** | 一条**手持/大幅运镜**的片子 | ②的另一半（运镜假阳性），也是 A3「最短镜长」会不会误伤的对照 | 同上 |

**量什么（一张表，每次改动重跑）**：

| 列 | 定义 |
|---|---|
| `TP / FP / FN` | 匹配容差 **±2 帧**（不是 tolerance=0：我们是给人看的分镜表，不是学术基准；容差要**写死在测试里**并说明理由） |
| `precision / recall / F1` | 按上面 |
| `Δframes` | 每个 TP 的「报出来的帧 − 人标的帧」，**要看分布不看均值**（均值会把「量化的对称误差」和「转场的系统偏早」抵消掉） |
| `假阳性分族` | 闪光 / 运镜 / 叠字 / 其他——**不分族就永远不知道改对了哪一条** |
| `墙钟` | 解码 + 推理分开记（否则改进了推理会被解码淹掉） |
| `平台` | darwin-arm64 / win32-x64 各一行（whisper 的教训） |

**跑法（先后顺序不能换）**：

1. **先量基线**（现役 `select=gt(scene,0.1)` + 现役 0.1s 量化）在 F1–F4 上的六列 → 这是所有后续改动的唯一对照。
2. **再量「去掉量化」的同一条**（只改这一处）→ 直接回答 §7.1 第 4 项。
3. **A 档逐项加、逐项量**（A1→A2→A3→A6），一次只动一个变量。
4. **B 的速度探针**：不接产品、不改代码，在 worktree 外起一个最小脚本（ffmpeg 出 48×27 rawvideo → ort-web wasm 跑 N 个窗口）只量时间与内存 → 回答 §7.1 第 1 项。**这一步的结论决定还要不要往下走。**

**额度/资源**：全部零 API 额度（ffmpeg + 本地 ONNX），成本只有人工标注 F2–F4。按 CLAUDE.md「评测/测试/验证类的额度花费默认授权」，这一档不需要额外拍板。

---

## 8. 未查到 / 待核实（诚实清单）

| # | 项 | 状态 |
|---|---|---|
| 1 | TransNetV2 的 **CPU 推理速度权威出处** | **未查到**。全网只有 LLM 摘要站的数字，原论文与官方 README 无速度小节（逐页核过） |
| 2 | **41 GMACs 的单位**（每窗口 / 每帧） | **未查到**（AutoShot 论文表里只有数值） |
| 3 | TransNetV2 权重的**训练数据条款**（IACC.3 / TRECVID 对再分发的约束） | **未查证**。仓库 MIT，但数据集条款未读 |
| 4 | AutoShot 权重文件**大小** | **未查到**（README 只给百度网盘链接，未标大小） |
| 5 | PERSIST 的 **F1 数字与输入规格** | **未查到**（README 无，本次未读论文 PDF） |
| 6 | DaVinci Resolve **官方手册原文** | **未读到**（镜像站两个 URL 均 404）；§4 的 Resolve 条目是 elements.tv 的二手评测 |
| 7 | `darwin/arm64` 那两个同尺寸 `.dylib` 是**真实两份还是符号链接** | **未核实**（unpkg 的 meta 不区分），所以 mac 侧包体写的是 45–90 MB 区间 |
| 8 | `scdet_score ≈ scene × 39.06` 的换算 | **算出来的，未实测校验** |
| 9 | 2024–2026 有没有**比 AutoShot 更好且放了权重**的 SBD 工作 | 本次搜了两轮**没搜到**。找到的 2025/2026 相关工作（arXiv 2502.09202 快于实时的运动场方法、2603.17374 InfoShot）**都不报 SBD 的 F1，也不放 SBD 权重**。不等于不存在，等于**本轮没查到** |
| 10 | 叠化时「切点」的产品定义（起点/中点/终点） | **没有定义**。这是产品取舍，不是技术问题，§7 的 F2 标注前必须先拍板 |

---

## 9. 本次实际打开过的链接（所有数字的出处）

**模型 / 论文**
- TransNetV2 仓库元数据（star 1043 / MIT / pushed_at 2023-12-04）：<https://api.github.com/repos/soCzech/TransNetV2>
- TransNetV2 README（F1 表：ClipShots 77.9 / BBC 96.2 / RAI 93.9）：<https://raw.githubusercontent.com/soCzech/TransNetV2/master/README.md>
- TransNetV2 inference README（输入 `[n_frames,27,48,3]`、uint8、RGB）：<https://raw.githubusercontent.com/soCzech/TransNetV2/master/inference/README.md>
- TransNetV2 PyTorch 移植 README（"It should produce identical results as the Tensorflow version"）：<https://raw.githubusercontent.com/soCzech/TransNetV2/master/inference-pytorch/README.md>
- `convert_weights.py --test` 的等价性判据（`np.isclose(...).mean()`）：<https://raw.githubusercontent.com/soCzech/TransNetV2/master/inference-pytorch/convert_weights.py>
- TransNetV2 权重的 Git LFS 指针（oid / size 5933260）：<https://raw.githubusercontent.com/soCzech/TransNetV2/master/inference/transnetv2-weights/saved_model.pb>
- TransNetV2 仓库文件树（LICENSE 存在、weights 目录结构）：<https://api.github.com/repos/soCzech/TransNetV2/git/trees/master?recursive=1>
- TransNetV2 论文（100 帧窗口 / 只取中间 50 个预测 / 训练集 50% dissolve / 无速度小节）：<https://ar5iv.labs.arxiv.org/html/2008.04838>
- AutoShot 论文（绝对 F1：SHOT 84.1 vs 79.9；ClipShots 78.7 vs 77.6；BBC 97.1 vs 96.2；RAI 95.5 vs 93.9；GMACs 37/30/41）：<https://ar5iv.labs.arxiv.org/html/2304.06116>
- AutoShot 仓库元数据（star 260 / MIT / pushed_at 2023-04-18）：<https://api.github.com/repos/wentaozhu/AutoShot>
- AutoShot README（权重 `ckpt_0_200_0.pth` 只在百度网盘）：<https://raw.githubusercontent.com/wentaozhu/AutoShot/main/README.md>
- PERSIST 仓库元数据（star 1 / Apache-2.0 / pushed_at 2026-09-04）：<https://api.github.com/repos/linty5/PERSIST>
- PERSIST README（权重在 GitHub Releases、需 MMAction2 栈、无 ONNX）：<https://raw.githubusercontent.com/linty5/PERSIST/main/README.md>
- 第三方 ONNX（31,250,929 字节 / MIT / downloads 0 / likes 1）：<https://huggingface.co/api/models/elya5/transnetv2?blobs=true> 与 <https://huggingface.co/elya5/transnetv2>
- 2025 快于实时的非神经方法（无 F1）：<https://arxiv.org/abs/2502.09202>
- 2026 InfoShot（不报 SBD F1）：<https://arxiv.org/abs/2603.17374>

**算法 / ffmpeg**
- `vf_scdet.c`（threshold 默认 10、sc_pass、`lavfi.scd.{mafd,score,time}`、mafd 公式）：<https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/vf_scdet.c>
- `f_select.c`（`get_scene_score`、`prev_picref` 每帧无条件更新、`FFMIN(mafd,diff)/100`）：<https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/f_select.c>
- PySceneDetect 仓库元数据（star 5193 / BSD-3-Clause / pushed_at 2026-09-21）：<https://api.github.com/repos/Breakthrough/PySceneDetect>
- PySceneDetect 检测器 API（AdaptiveDetector 默认值 3.0/15/2/15.0；ContentDetector 27.0/15/filter_mode=MERGE；weights 四项）：<https://www.scenedetect.com/docs/latest/api/detectors.html>
- PySceneDetect CLI 默认值（content 27.0 / adaptive 3.0 / threshold 12.0 / min-scene-len 0.6s）：<https://www.scenedetect.com/docs/latest/cli.html>
- PySceneDetect 官方基准表（BBC 与 AutoShot 两组 P/R/F1，tolerance=0）：<https://raw.githubusercontent.com/Breakthrough/PySceneDetect/main/benchmark/README.md>

**同类产品**
- LosslessCut `detectSceneChanges` 的 filter 与正则：<https://raw.githubusercontent.com/mifi/lossless-cut/master/src/main/ffmpeg.ts>
- Kdenlive `scenesplittask.cpp`（`select='gt(scene,%1)',showinfo`、threshold/100.）：<https://invent.kde.org/multimedia/kdenlive/-/raw/master/src/jobs/scenesplittask.cpp>
- Resolve vs Premiere 实测对比（"both were unable to detect an edit with a dissolve transition effect"）：<https://elements.tv/blog/exploring-the-new-scene-cut-detection-features-of-davinci-resolve-and-adobe-premiere-pro/>
- VideoBricks（1 star / AGPL-3.0 / TransNetV2 ONNX + 打包 Python）：<https://api.github.com/repos/alonsorobots/VideoBricks> 与 <https://raw.githubusercontent.com/alonsorobots/VideoBricks/main/README.md>
- 浏览器侧 TransNetV2 方案讨论（31.3 MB / 48×27 batch / ORT Web adapter / 要求独立核 sha256）：<https://github.com/Hugowhitee/beat-video-maker/issues/13>
- npm 无 TransNetV2 包：<https://registry.npmjs.org/-/v1/search?text=transnet&size=20>

**运行时**
- `onnxruntime-node@1.30.0` 元数据（unpackedSize 301,068,136 / MIT）：<https://registry.npmjs.org/onnxruntime-node/latest>
- `onnxruntime-node@1.30.0` 逐平台二进制体积：<https://unpkg.com/onnxruntime-node@1.30.0/?meta>
- `onnxruntime-web@1.30.0` 元数据：<https://registry.npmjs.org/onnxruntime-web/latest>
- 官方文档「All ONNX operators are supported by WASM but only a subset are currently supported by WebGL, WebGPU and WebNN」：<https://onnxruntime.ai/docs/tutorials/web/>
- WebGPU 侧 3D Conv 的历史限制（"Only Conv2d or Conv1d are supported"）：<https://github.com/microsoft/onnxruntime/pull/32688>
- Electron 打包原生模块 asarUnpack 的坑：<https://www.electronforge.io/config/plugins/auto-unpack-natives>

**仓库内（本地实读，非网页）**
`electron/video/detectShotCuts.ts` · `electron/video/shotTimeline.ts` · `electron/shared/canvas/shotTime.ts` · `electron/shared/canvas/videoDepthModels.ts` · `electron/shared/localSpeech/localSpeechAssets.ts` · `electron/video/depthVideoModelCache.ts` · `electron/protocol/localRuntimeAssets.ts` · `src/workbench/generationCanvas/videoDepth/videoDepth.worker.ts` · `package.json` · `node_modules/onnxruntime-web/dist/*.wasm` · `…/scratchpad/reelbench-skills/demo-report/shots.json`
