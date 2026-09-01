# 即梦官方 dreamina CLI 现役矩阵（v1.4.17）

> **这是 SOURCE。** 后续 Nomi 侧即梦档案/编解码的所有变体、分辨率枚举、时长边界、必填参数、多模态输入约束都从这份矩阵派生（不从记忆、不从 6 月旧 `-h`、不从任何旧评估）。
>
> - **CLI 版本**：`1.4.17`（`~/.dreamina_cli/version.json`：`release_date 2026-08-18`；`release_notes` = 「为seedance 2.5增加1080p分辨率的参数支持」）
> - **二进制 build**：`dreamina --version` = `{ version: "673dd28-dirty", commit: "673dd28", build_time: "2026-08-17T16:06:28Z" }`
> - **checkedAt**：2026-09-01（本机 macOS arm64，用户级安装 `~/.local/bin/dreamina`，无 sudo）
> - **抓取法**：官方安装命令 `curl -fsSL https://jimeng.jianying.com/cli | bash` 更新后，逐子命令 `dreamina <cmd> -h` dump（原文见本文件各节）。
> - **旧版本（本次更新前）**：`54f1bdf`（`build_time 2026-06-18T12:30:12Z`）——即之前评估误当事实源的那个 6 月旧 build。

---

## 0. CLI 校验时序（决定「哪些能干跑验证、哪些必须 VIP 登录才验」）

实测两类校验的触发顺序（未登录态，本机探针 2026-09-01）：

| 校验类别 | 触发时机 | 干跑可验？ | 探针证据 |
|---|---|---|---|
| **required-flag**（cobra `MarkFlagRequired`：`--video_resolution` / `--resolution_type` 缺失） | **鉴权前** | ✅ 是 | 缺 `--video_resolution` → `required flag(s) "video_resolution" not set`；缺 `--resolution_type` → `required flag(s) "resolution_type" not set` |
| **值组合校验**（model_version / ratio / duration / resolution_type 的具体取值是否被该模型支持） | **鉴权后** | ❌ 否（先撞 `未检测到有效登录态`） | `--ratio=99:1`、`--duration=99`、`--model_version=seedance9.9`、`5.0Pro --resolution_type=1k` 全部先返回 `未检测到有效登录态，请先执行 dreamina login`，够不到组合校验 |

**结论**：必填参数（v1.4.14）的存在性可 100% 干跑验证并已验；**具体非法值组合的拒绝行为无 VIP 登录态不可达** → 这些边界的权威只能是本矩阵的 `-h` 原文，真实生成 smoke 标 blocked（见任务 blocked 项）。

---

## 1. 视频命令矩阵

### 通用（v1.4.14 破坏性变更，现役强制）
- **`--video_resolution` 在所有 4 个视频命令 + multiframe2video 上均为 required**（-h 原文 "required"；探针 pre-auth 命中）。
- duration / video_resolution / 显式 ratio 一律**严格校验**，不支持的旧值直接**拒绝**，不再静默夹取（-h 原文："unsupported or legacy values are rejected instead of silently adjusted"）。
- 「部分模型首次使用需先在即梦 Web 端完成首次生成；提交后返回 `AigcComplianceConfirmationRequired` 即属此情况。」（每个视频子命令 -h 都有此段）

### text2video

| 维度 | 现役支持值（-h 原文） |
|---|---|
| model_version | `seedance2.0`, `seedance2.0fast`, `seedance2.0_vip`, `seedance2.0fast_vip`, `seedance2.0mini`, **`seedance2.5`** |
| 默认 model_version | `seedance2.0fast` |
| ratio | `1:1`, `3:4`, `16:9`, `4:3`, `9:16`, `21:9`（省略默认 `16:9`） |
| video_resolution（**required**） | `seedance2.5` → `480p / 720p / 1080p`；`seedance2.0_vip` → `720p / 1080p / 4k`；其余所有 → `720p` |
| duration | `seedance2.5` → **4-30**；其余所有 → **4-15**（默认 5） |
| VIP | `seedance2.5` VIP-only |

### image2video

| 维度 | 现役支持值 |
|---|---|
| 必填 | `--image`, `--prompt`, `--video_resolution` |
| model_version | `seedance1.0fast`, `seedance1.5pro`, `seedance2.0`, `seedance2.0fast`, `seedance2.0_vip`, `seedance2.0fast_vip`, `seedance2.0mini`, **`seedance2.5`** |
| 默认 model_version | `seedance2.0_vip` |
| ratio | 由输入图推断，**不在本命令设置** |
| video_resolution（required） | `seedance2.5` → `480p/720p/1080p`；`seedance2.0_vip` → `720p/1080p/4k`；其余 → `720p` |
| duration | `seedance1.0fast` → 5-10；`seedance1.5pro` → 5-12；`seedance2.0 家族/2.0mini` → 4-15；`seedance2.5` → 4-30（默认 5） |

### frames2video

| 维度 | 现役支持值 |
|---|---|
| 必填 | `--first`, `--last`, `--prompt`, `--video_resolution` |
| model_version | `seedance1.5pro`, `seedance2.0`, `seedance2.0fast`, `seedance2.0_vip`, `seedance2.0fast_vip`, `seedance2.0mini`, **`seedance2.5`** |
| 默认 model_version | `seedance2.0_vip` |
| ratio | 由首帧图尺寸推断 |
| video_resolution（required） | `seedance2.5` → `480p/720p/1080p`；`seedance2.0_vip` → `720p/1080p/4k`；`seedance1.5pro` → `720p`；其余 seedance2.0 → `720p` |
| duration | `seedance1.5pro` → 5-12；`seedance2.0 家族/2.0mini` → 4-15；`seedance2.5` → 4-30（默认 5） |

### multimodal2video（全能参考 / 全能参考 / formerly ref2video）

| 维度 | 现役支持值 |
|---|---|
| 输入 | 任意混合 `--image` / `--video` / `--audio`（可重复） |
| model_version | `seedance2.0`, `seedance2.0fast`, `seedance2.0_vip`, `seedance2.0fast_vip`, `seedance2.0mini`, **`seedance2.5`** |
| 默认 model_version | `seedance2.0_vip` |
| ratio | `1:1, 3:4, 16:9, 4:3, 9:16, 21:9`（省略默认 16:9） |
| video_resolution（required） | `seedance2.5` → `480p/720p/1080p`；`seedance2.0_vip` → `720p/1080p/4k`；其余 → `720p` |
| duration | `seedance2.5` → 4-30；其余 → 4-15（默认 5） |
| **输入约束（关键差异）** | **`seedance2.5`**：**允许纯音频**；`image<=30, video<=10, audio<=10, total<=50`；每段及总视频/音频时长 `2-30s`。**`seedance2.0 家族/2.0mini`**：至少一张 `--image` 或 `--video`（**不可纯音频**）；`image<=9, video<=3, audio<=3, total<=12`；每段及总视频/音频时长 `2-15s` |

### multiframe2video（多帧叙事，固定模型无 model_version）

| 维度 | 现役支持值 |
|---|---|
| 输入 | 2-20 张图 |
| **video_resolution（required）** | **`720p` 或 `1080p`** ← 新增：此前无此 required 参数 |
| model_version | **不可配置**（固定模型） |
| ratio | 由首图推断 |
| 段时长 | 每段 1-8s，总时长 >= 2；2 图用 `--prompt`+`--duration`（默认 3）；3+ 图 N-1 句 `--transition-prompt` + 可选 N-1 个 `--transition-duration`（省略每段默认 3s） |

---

## 2. 图片命令矩阵

### 通用（v1.4.14 破坏性变更）
- **`--resolution_type` 在 text2image / image2image 上均为 required**（-h 原文 "required"；探针 pre-auth 命中）。
- resolution_type / 显式 ratio 严格校验，旧值拒绝不夹取。
- 自定义 width/height 与 `--ratio` 互斥，须成对给正整数，且 `--resolution_type` 必填。

### text2image

| 维度 | 现役支持值 |
|---|---|
| model_version | `3.0, 3.1, 4.0, 4.1, 4.5, 4.6, 4.7, 5.0, **5.0Pro**`（默认 `5.0`） |
| ratio | `21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16`（默认 16:9） |
| generate_num | 1-10（默认 1） |
| **resolution_type（required, 按模型）** | `3.0/3.1` → `1k 或 2k`（自定义 width/height 需 2k）；`4.0/4.1/4.5/4.6/4.7/5.0` → `2k 或 4k`；**`5.0Pro` → `1.5k, 2k, 或 4k`（无 1k）** |

### image2image

| 维度 | 现役支持值 |
|---|---|
| 输入 | 1-10 张本地图 |
| model_version | `4.0, 4.1, 4.5, 4.6, 4.7, 5.0, **5.0Pro**`（默认 `5.0`） |
| ratio | 同 text2image |
| generate_num | 1-10 |
| **resolution_type（required, 按模型）** | `4.0/4.1/4.5/4.6/4.7/5.0` → `2k 或 4k`；**`5.0Pro` → `1.5k, 2k, 或 4k`** |

### 自定义 width/height 边界（text2image & image2image 共用）
| resolution_type | 每边像素 | 总像素上限 |
|---|---|---|
| 1k | 512-2016 | 1763584 |
| 1.5k | 972-2268 | 2359296 |
| 2k | 768-3072 | 4194304 |
| 4k | 1536-6240 | 16777216 |

### image_upscale
| 维度 | 现役支持值 |
|---|---|
| resolution_type（required） | `2k, 4k, 8k` |
| model_version | 无 |

---

## 3. 查询 / 异步
- `query_result --submit_id=<id>`（可选 `--download_dir`）；异步任务两步（提交返回 submit_id → 查询）。
- 所有生成子命令支持 `--poll=N`（提交后阻塞轮询 N 秒，0 关闭）。
- `--session=<id>`（默认 0「默认对话」）所有生成命令通用。

---

## 4. 版本变更映射（编排者亲读飞书《即梦 CLI 体验指南》 vs 本机 -h 实测，交叉验证一致）

| 版本 | 变更 | 本机 v1.4.17 -h 是否印证 |
|---|---|---|
| v1.4.14（07-21） | 图片必须显式 `--resolution_type`，视频必须显式 `--video_resolution` | ✅ required 均在，pre-auth 强制 |
| v1.4.15（08-01） | 视频全线支持 Seedance 2.5（480P/720P、4-30s、多模态 2-30s 及纯音频） | ✅ seedance2.5 在四个视频命令；multimodal2video 2.5 允许纯音频、2-30s |
| v1.4.16（08-14） | seedream 5.0 pro 加 1.5k、**移除 1k** | ✅ text2image/image2image 的 `5.0Pro → 1.5k/2k/4k`（无 1k）；模型名在 -h 里是 `5.0Pro` |
| v1.4.17（08-18） | seedance 2.5 加 1080P | ✅ 四个视频命令 seedance2.5 → 480p/720p/**1080p** |

---

## 5. 命名裁决（以现役 help 原文为据，供 #258 争议 & 旧档案对齐）

- Seedance 2.5 的 `--model_version` 字符串在**所有**视频子命令 -h 里都写作 **`seedance2.5`**（有小数点，无连字符，无「3」）。
  - ❌ 不是 `seedance-3` / `dreamina-seedance-3` / `seedance3`。#258 侧支线里出现的「dreamina-seedance-3」重命名结论 **不采纳**——本机现役 CLI help 无「3」这个模型。
  - ⚠️ `docs/plan/2026-09-01-provider-proxy-and-onboarding-hardening.md:21` 提到一个 `dreaminaSeedance3.ts` 文件，main 上**不存在**该文件，属侧支线提案，不作为现状。
- Seedream 图片 pro 档在 -h 里写作 **`5.0Pro`**（`--model_version=5.0Pro`）。
- 视频档案家族名保持「Seedance」；即梦 CLI 底层现覆盖 seedance1.0fast/1.5pro/2.0 家族/2.5，**不再只是 2.0**。
