# 切点超上限修复：实测证据归档

方案文档：`docs/plan/2026-09-22-shot-cut-truncation.md`
根因合同：`docs/fixes/2026-09-22-shot-cut-truncation.root-cause.json`

这些文件原先住在 agent 的 scratchpad（`/scratchpad/` 被 `.gitignore` 挡在树外），方案里按
`scratchpad/…` 的路径引用它们——于是评审者拿不到任何一份原始数据。2026-09-22 归档到这里，
方案文档里的引用同步改指向本目录。

**素材本身不进仓库**（用户本机的版权片段 + 用户自己的录制），只有测量输出进来。
本目录全部是文本/JSON，最大一份 29 KB，合计 288 KB。

## 三条素材的代号

| 代号 | 片子 | 片长 / 帧率 |
|---|---|---|
| F1 | `demo-video.mp4` | 202.9s @30 |
| F2 | `demo-en.mp4` | 287.4s @23.976 |
| F3 | 快剪电影开场 | 361.1s @29.97 |

## 文件对应方案哪一节

| 文件 | 对应 | 它能证明什么 |
|---|---|---|
| `shot-boundary-research.md` | §4「先查别人」、§7 | 上一轮选型调研全文。§4 表里 LosslessCut / Kdenlive / PySceneDetect / DaVinci 四家的实读记录与链接出自这里 |
| `sbd/REPORT.md` | §7「scdet 的处置」 | 方案 §7 直接点名引用的那份报告。「`select` 与 `scdet` 算法相同、耗时持平」这条结论在它的 §2.2 |
| `sbd/results/ffmpeg-select-F1.txt`<br>`…-F2.txt`<br>`…-F3.txt` | **§5、§6 的一手输入** | 生产同款 filtergraph `select='gt(scene,0.1)',metadata=print` 的原始逐帧输出（`pts` + `lavfi.scene_score`）。行数实测：F1 **77** 刀、F2 **51** 刀、F3 **447** 刀 —— 与 §5 表中「ffmpeg@0.1 报几刀」一行逐个对得上。§5 的 A/B/C/D 四策略与 §6 的去重窗口扫描都是在这份分数表上算的 |
| `sbd/results/cuts.json` | §5「真值」行 | 三条素材的切点清单：`transnetv2_p>0.3 / p>0.5 / p>0.7` 与 `ffmpeg_select_scene_gt_0.1_raw`。F3 的 `p>0.5` 恰为 **65** 条 —— 即 §5 表里 F3 那一列的真值 |
| `sbd/results/comparison.json` | §5 / §6（F1、F2） | F1、F2 上各阈值的精确率 / 召回 / F1 明细 |
| `sbd/results/extra-experiments.json` | §6 去重表 | `F1_ffmpeg0.1_dedup` / `F2_ffmpeg0.1_dedup` 等条目的 n / P / R / F1 |
| `sbd/node/bench.mjs`、`bench-default.mjs`<br>`sbd/results/bench-*.json`、`wasm-first-window-*.json` | §7 耗时 | 「两者耗时持平」那条结论的计时脚本与原始计时输出 |

## 没找到的文件

方案文档此前引用了下面三份，**在 `nomi-scratch-0921`、`nomi-scratch-0917` 及 Desktop 下递归搜索均未找到**
（没有任何 `trunc/` 目录；同名的 `scripts/sweep.mjs` 是仓库里无关的另一个脚本）：

| 原引用路径 | 状态 |
|---|---|
| `scratchpad/trunc/compare.json` | **未找到** |
| `scratchpad/trunc/compare.mjs` | **未找到** |
| `scratchpad/trunc/sweep.mjs` | **未找到** |

后果说清楚：**§5 四策略对比表与 §6 去重窗口扫描表的「计算脚本」没有归档**，表里的
P / R / F1 数字是当时记录下来的，本次归档没有重新跑过。可归档的是它们的**输入**——
`ffmpeg-select-F*.txt` 的逐帧分数表与 `cuts.json` 的真值清单都在，两张表原则上可以由这份输入重算。
方案文档里这两处已就地标注「原始数据未能归档，数字为当时记录」。

另有一处口径差异照实记下：§5 的 F1 / F2「真值」写的是**人工 52 刀 / 45 刀**，而 `cuts.json` 里
只有 TransNetV2 的 44 / 44。那份人工标注没有落进任何文件，**也未归档**。F3 的真值（TransNetV2 p>0.5 = 65）
是有文件的。

## 留在 scratch 里没有归档的

体积考虑，下面这些没有复制进来（原件仍在
`/Users/aoqimin/Desktop/nomi-scratch-0921/_video-breakdown-mcp-session/sbd/`）。
它们只支撑 §7 的 scdet 结论，而那条结论的文字版在 `sbd/REPORT.md` 里已经有了：

| 文件 | 体积 | 为什么没进来 |
|---|---|---|
| `results/ffmpeg-scdet-F3.txt` | **1.14 MB** | 超 1 MB；scdet 逐帧原始转储 |
| `results/ffmpeg-scdet-F2.txt` | 723 KB | 同上 |
| `results/ffmpeg-scdet-F1.txt` | 654 KB | 同上 |
| `results/scdet-F1/F2/F3.json` | 287 / 319 / 492 KB | scdet 全帧曲线，§7 已决定本次不做 |
| `results/transnet-F1/F2/F3.json` | 173 / 183 / 292 KB | TransNetV2 的窗口级原始输出；派生出的真值清单已在 `cuts.json` |
| `TransNetV2/` | — | 第三方仓库 checkout，不是本次产出 |
| `bullets-skeleton.json` | 9 KB | 与本次无关 |

## 本次修复自己的执行层证据不在这里

「联系表第 i 格 = 第 i 刀」那条是**测试**，不是归档数据：
`electron/video/shotCutSheetAlignment.realMedia.test.ts`，素材走 `NOMI_REAL_MEDIA_DIR`，
登记在 `tests/ux/real-media-fixtures.json`。缺素材硬红，不 skip。
