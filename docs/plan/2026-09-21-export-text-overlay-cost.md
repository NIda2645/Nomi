# 导出：文字层一多就慢几十倍、吃数 GB 内存（根因修复方案）

状态：实施中 · 分支 `fix/export-text-overlay-cost-20260921` · 基线 `origin/main@46b71c973`

## 一句话

时间轴上每多一条字幕/标题卡，导出就多喂 ffmpeg **一整条与成片等长的全画幅 RGBA 流**——
`enable` 只挡「混不混」，不挡「生不生成」。60 条字幕把 107 秒的导出拖成 75 分钟、内存从 1 GB 涨到 6.7 GB，
全程零报错。修法是让每条叠加层的上游**只生成它自己可见的那一段**。

## 用户那一刻卡在哪（D1）

字幕是最普通不过的东西：一条 3 分钟的片子配 100 句字幕，就是 100 条文字层。
今天这样的时间轴点「导出」，进度条会走好几个小时，风扇狂转，内存吃到几个 GB，
**而且不报任何错**——用户只会以为 Nomi「导出很慢」，不会知道这是一个 bug。

## 现状机制（已读源码 + 真调用仓库代码实测）

`electron/export/ffmpegFiltergraph.ts` `buildTextOverlayGraph`：

- 每条文字 PNG 是一个独立 ffmpeg 输入，输入参数写死 `-loop 1 -t <时间轴全长>`；
- 然后链式 `overlay=0:0:eof_action=pass:enable='between(t,a,b)'`。

`enable` 是 libavfilter 的 timeline 开关：官方文档写「if the evaluation is non-zero, the filter will be enabled,
otherwise the frame will be sent unchanged to the next filter」——它只决定**要不要混**，
上游那条 `-loop 1` 的静帧流照样按全片长逐帧产出、入队、参与 framesync。
所以成本 ≈ **N × 全片帧数 × 全画幅 RGBA**。

### 实测（2026-09-21，真调用 `compileFfmpegFiltergraph` + `buildWebmToMp4Args`，argv 原样喂仓库自带 ffmpeg）

素材：真实视频 202.9 s 有音轨，1080×1920/30fps/medium/crf23；N 张全画幅透明 PNG，时间窗首尾相接。

| N | 耗时 | 相对 N=2 | 峰值内存 |
|---|---|---|---|
| 2 | 107 s | 1.0x | 1.01 GB |
| 60 | 4524 s（75 分钟） | 42.3x | 6.71 GB |
| 120 | 外推 3.2–4.6 小时 | — | ~8.7–9 GB |

同一形状在 15 秒校准段上复现（本分支基线，同机同素材）：N=2 6.6 s / 0.99 GB；N=60 297.7 s / 5.74 GB
→ **45.1x 耗时、5.8x 内存**。`argv` 36 KB 远小于 `ARG_MAX`，不是瓶颈。

## 先查别人（R5）

| 来源 | 查到什么 | 对本方案的意义 |
|---|---|---|
| FFmpeg 官方文档 · Timeline editing（<https://ffmpeg.org/ffmpeg-filters.html#Timeline-editing>，2026-09-21 查） | 「the frame will be sent unchanged to the next filter」——disabled 只是直通，不涉及上游 | 证实 `enable` 不是省成本的手段，成本必须在**输入侧**省 |
| FFmpeg 源码 `libavfilter/framesync.c` `ff_framesync_init_dualinput`（<https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/framesync.c>，2026-09-21 查） | `fs->in[1].before = EXT_NULL`（第二路首帧之前视为「没有帧」） | **这是方案 B 成立的依据**：叠加流晚开始不会卡住主链，主帧直接直通 |
| FFmpeg 源码 `libavfilter/vf_overlay.c` `do_blend`（同日查） | `if (!second) return ff_filter_frame(ctx->outputs[0], mainpic);` | 第二路没帧时主帧原样输出，像素不变 |
| FFmpeg 官方文档 · framesync `eof_action` | `pass` = 第二路 EOF 后把主路直通 | 叠加流提前 EOF 是安全的；我们本来就在用 `eof_action=pass` |
| MLT（Kdenlive 的渲染引擎）`src/framework/mlt_playlist.c`：`mlt_playlist_virtual_append` 第 333-334 行 `frame_in = in; frame_out = out;`，`mlt_playlist_blank()` 第 716-731 行（<https://raw.githubusercontent.com/mltframework/mlt/master/src/framework/mlt_playlist.c>，2026-09-21 查） | 一条轨 = playlist：每个 entry 带**自己的 in/out**，空档是显式 `blank` 长度，不是「一条铺满全片的素材」 | 成熟剪辑引擎的通用形状就是「每个条目只在自己的区间存在」。我们的视觉 clip 路径已经是这个形状，文字层不是 |
| Kdenlive `dev-docs/mlt-intro.md`（同日查） | playlist 顺序容器 + tractor 并行合成 + transition 两两混合 | 多层合成用「层数」定成本，不用「条目数」定成本 |

**仓库内的近邻 prior art（最有说服力的一条）**：同一个文件里的视觉 clip 路径
`buildBasicVisualGraph`（`electron/export/ffmpegFiltergraph.ts:441-469`）早就是对的——
图片 clip 的输入是 `-loop 1 -t <该素材最长的那个 clip 的时长>`（`buildInputs`，:326-333），
再 `trim` + `setpts` 落到时间轴位置。**同一个文件里两套写法，文字层那套漏了这条不变量。**

## 类根因

> **叠加层的上游必须只生成它自己可见的那段时间；`enable` 是显示开关，不是成本开关。**

违反它的判据是机器可查的：一个 `-loop 1` 静帧输入的 `-t`，必须等于**消费它的那个可见窗口**，
绝不能等于时间轴全长。

## 同类扫描（「每个条目一条全片长上游 / 链式合成」这个形状还有几处）

见 `docs/fixes/2026-09-21-export-text-overlay-cost.root-cause.json` 的 `same_class_entry_points`，
结论表在本文档末尾「同类扫描结果」一节（实测后回填）。

## 方案对比（D6：你要权衡的那一个点＝「改图的形状」还是「改输入的长度」）

| 方案 | 做法 | 耗时/内存 | 正确性风险 | 实现复杂度 |
|---|---|---|---|---|
| **A 分组 concat** | 不重叠的层按 z 序分组，每组用 concat demuxer 拼成一路带 alpha 的流（空档补透明帧），每组只叠一次 | 实测 N=120 41 s / 0.97 GB | **高**：要自己补空档透明帧、要处理重叠分组、concat 的时长由每段 duration 累加决定，**帧边界会漂**，`enable` 的闭/开区间语义整个消失 | 高（新增分组器 + 空档生成 + 临时文件） |
| **B 输入窗口化（选中）** | 每条层的输入 `-t` 只覆盖自己的窗口（前后各留 2 帧余量），用 `setpts` 落到时间轴位置；**`overlay` 链与 `enable` 表达式一个字不改** | 见下文实测 | **低**：图的形状、层序、`enable` 边界全部不变；唯一新语义是「窗口外没有第二路帧」，而这正是 framesync 文档化的 `EXT_NULL` 直通 | 低（一个函数内改 ~15 行 + 一条不变量断言） |
| C 逐帧自绘 | 像 Remotion 那样自己渲染每一帧再编码 | — | — | 不在本次范围：整条导出后端要重做 |

**为什么不选 A**：A 只优化了「像素怎么合」，代价是把「哪一帧该显示」这件事从 `enable` 表达式
搬到 concat 的时长累加里——而逐帧等价正是这次的硬门槛。B 把成本问题在**输入侧**解决，
显示语义一个字不动，等价性是结构上保证的，不是靠对齐运气。

## 范围

改：
- `electron/export/ffmpegFiltergraph.ts`：`buildTextOverlayGraph` 改为窗口化输入 + `setpts` 落位；
  新增唯一构造「循环静帧输入」的收口函数与不变量断言（失败 fail-closed 抛 `FfmpegFiltergraphError`）。
- `electron/export/ffmpegFiltergraph.test.ts`：更新既有两条断言 + 新增类级测试（0/1/N 条、空档、重叠、超出片尾、<1 帧窗、极多层）。
- 新增真实素材导出回归测试（填 `export-real-media` 那条债）。

**不动**：
- `enable` 表达式、层序、`overlay` 选项、末条 `format=` 收口 —— 一个字不改；
- 视觉 clip 链、过渡链、音频链的**行为**（只做量级评估并记录，见同类扫描）；
- `src/workbench/export/textOverlayPng.ts`（PNG 还是全画幅透明，不改）；
- 文字层的数据模型（重叠仍然合法）。

## 回滚

单 commit 回退即可：改动集中在 `buildTextOverlayGraph` 一个函数 + 测试。
没有开关、没有并行路径（P1），回滚 = `git revert`。

## 验收门

1. `electron/export/ffmpegFiltergraph.test.ts` 全绿（含新增类级形态测试）；
2. **逐帧等价**：新旧实现对同一 manifest 的输出，在多种形态 × 多个采样点（含每个窗口首帧、末帧、
   边界前后各 1 帧）上帧内容一致（阈值见下）；
3. **成本**：同机同素材，N=60 相对 N=2 的耗时倍数与内存倍数落在预算内（相对判据，平台无关）；
4. 回归测试在**未修代码**上先红（留红的输出）；
5. `pnpm run typecheck`、`check:root-cause-contracts`、`check:door-map`、`check:filesize`、
   `check:heavy-path`、`check:real-media-fixture`、`check:test-waits`、`check:boundaries` 全绿。

### 逐帧等价的阈值与理由

新旧两条 argv 都经 libx264 `crf=23` 有损编码，**同一像素输入不保证出同一比特**（帧类型决策
受相邻帧内容影响）。因此比较**解码后的像素**，判据用 ffmpeg `psnr` 滤镜：
逐个采样时刻抽新旧各一帧做 PSNR，要求 `≥ 50 dB`（视觉无损，等价于平均每通道误差 < 1/300 量化级）；
**任何一个采样点低于阈值即视为回归**。抽帧用 `-ss <t> -frames:v 1` 在两条产物上同一时刻取，
时刻集合包含：每个窗口的 `start`、`end`、`start - 1/fps`、`end + 1/fps`，以及片头片尾。

## 同类扫描结果

（实测后回填）
