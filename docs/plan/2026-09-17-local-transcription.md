# 本地转写 provider（批次 3 · T-MO-11）

状态：已实现，真机验收过（mac arm64）。基线 e96614e14。任务书编号与 TODO 里已完成的模型可用性任务同号，本计划以 09-17 批次 3 任务书为准，不改旧 TODO 身份。

## 用户镜头

拆解视频的对白，今天只能走云端（APIMart Whisper / ElevenLabs Scribe）——没网、不想把素材传出去、额度用完，对白列就只能是空的。这次补的是第三条线：**在这台电脑上离线转写**，不联网、不花钱，语言从音频自己听出来。

首次用它要先下一次引擎与权重（≈575 MB），这件事**开跑前就说**，下载期间节点上有一行走着的进度；任何一步失败都说清是哪一步、为什么，并在分镜表上给一颗**「改用云端重试」**按钮。切换只能是用户点的那一下——代码不许在失败时自己切云端，那样用户会在不知情的情况下花钱，本地那条坏了也就再没人知道。

## 范围与不动项

**做**：`transcribe` taskKind 的第三个 provider（声明驱动，不是新概念）；可信下载（钉死版本 + 逐文件 sha256 + 原子落盘 + 进度 + 磁盘满单独成档）；sidecar 生命周期；长音频分段与接缝；错误分类与云端出口；供应链版本钉登记与门岗。

**不动**：云端那两条线的任何行为；拆解的切点 / 抽帧 / 报价 / 令牌那几段；引擎不进安装包（见下「打包边界」）。

**不做**（明确划掉，不是没做完）：第二个 ASR 引擎（sherpa-onnx / Parakeet）——单引擎裁决；Python 依赖或 native addon——前者被 Kdenlive 验证是坑，后者无 prior-art；自研解压器——系统自带 bsdtar 已经有。

**回滚**：逐里程碑 revert 本分支提交。缓存只写 `userData/model-cache/local-speech/`，不碰用户项目与原始素材。

## 先查别人：四列表（R5 ④）

调研正本：`~/Desktop/nomi-scratch-0917/batch3/T-MO-11-local-transcription-prior-art.md`。
实读上游（2026-09-17）：OpenWhispr `scripts/download-whisper-cpp.js`、`src/helpers/whisperServer.js`；whisper.cpp `examples/server/README.md`；并用 0.0.10 二进制对真素材**实跑**核对过请求与响应形状。

| 它提供 | 我们用 | 我们另写 | 我们拆散 |
|---|---|---|---|
| whisper.cpp 的多语言识别与 auto 语言检测 | whisper-server `/inference`，verbose_json | 不写任何 ASR 推理 | 不拆解码器内部 |
| 预编译 sidecar + Windows 的 MSVC 运行时 DLL | 同样钉死版本、逐文件 sha256、spawn 回环生命周期 | Nomi 自己的资产清单、缓存目录、取消与错误投影 | 不照搬它的多引擎与 GPU 静默 fallback |
| server 给的段级时间戳 | 折进统一的结果形状（与云端 verbose_json 同形） | 长素材按 30 秒窗口整数倍切、按句子边界续接、全局时间偏移归并 | 不重写模型内部那 30 秒推理窗口 |
| 系统自带 bsdtar（`tar -xf` 认 zip） | 直接用它解包 | 解包后逐成员 sha256 复验 | 不自研 zip 解析 |
| 既有 depthVideoModelCache 的 hardenedFetch + sha256 + 原子落盘 | 抽成共用原语两家同用 | 新增磁盘满分类 | **删掉** Depth 独占的那份下载主体 |

## 参考实现逐层对照

| 层 | 它怎么做 | 我们怎么做 | 判定 |
|---|---|---|---|
| 传输 | whisper-server HTTP multipart | 同一 taskKind 声明 localEngine，走同一个 multipart | 一致 |
| 出站 | 自己开 fetch | 走 hardenedFetch + `allowedPrivateOrigins` 精确到本次端口 | 有意不同：目的地策略只有一个 owner |
| 会话 | server 保温供连续听写 | 一次任务一个进程，`finally` 必收 | 有意不同：批处理不是听写，保温换不来后台常驻 600 MB |
| 上下文 | prompt 字典 + 音频 | 只给音频，language 恒 auto | 有意不同：用户硬约束②，不留「选错语言」的路 |
| 档位 | 多引擎 / 多 GPU 档 | 单引擎单档（实测裁掉另外三档） | 有意不同：见下「档位的算式」 |
| 控制流 | 自动 GPU fallback 与重试 | 每段重试一次，再失败带段号抛出；**禁止自动换云端** | 有意不同：硬约束要求失败可见 |
| 安全 | 固定 release，DLL 随 exe | 固定 sha256、完整安装校验、只听回环、退出回收 | 一致 |

## HTTP 接触面裁决

`file` 派生自当前音频分段；`language` 常量 `auto`（用户硬约束）；`response_format` 常量 `verbose_json`（与云端解析契约同形）；`translate` 不用（要原语种）；`prompt` 不用（避免 UI locale 污染）；`temperature` 常量 `0.0`（否则「重试一次」变成掷骰子）；`model` 派生自校验通过的权重路径；`host` 常量 `127.0.0.1`；`port` 由 OS 分配；`threads` 由主机核数派生（夹在 2–8）。规范：whisper.cpp `examples/server/README.md`。偏差：只开放上述子集，不新增上游字段；分段进度与错误是**宿主事件**，不伪装成上游协议。

## 档位的算式（实测，不是拍脑袋）

真素材（`NOMI_REAL_MEDIA_DIR` 登记的中英混口播 120 秒，M5 / Metal），另用三段真素材复核：

| 档位 | 体积 | CER | 速度 | 裁决 |
|---|---|---|---|---|
| large-v3-turbo-q5_0 | 574 MB | 6.5% | 11.5× 实时 | **唯一入选** |
| large-v3-q5_0 | 1081 MB | 6.8% | 7.1× 实时 | 砍。贵 507 MB、慢 1.6 倍、质量在噪声里持平；产品演示那 40 秒它整段幻听成「请不吝点赞 订阅…」而 turbo 转对了。挂成「更稳」是卖降级 |
| medium-q5_0 | 539 MB | 8.2% | 13.3× 实时 | 砍。只小 35 MB 却更差 |
| small-q5_1 | 190 MB | 36.8% | 30× 实时 | 砍。对普通话输出**繁体**，把 "web coding" 听成「外部 coding」 |

只剩一档，所以**档案里连那个下拉都不要**（R2：没有行动价值的信息就删）。档位这套结构留着，是因为「弱机器 / 纯 CPU 的 Windows 要一个轻量档」是真实需求——但它得先有自己的实测数字。

## 打包边界（与任务书的一处有意偏离）

任务书写「`asarUnpack` + macOS 签名公证要覆盖该二进制」。实际裁决是**二进制根本不进安装包**，理由三条：① 权重 574 MB 进包等于让每个不用它的用户白下；② 这台打包链今天是 `identity: null` + afterPack 一次 ad-hoc `codesign --deep --sign -`，**没有 Developer ID、没有公证**——真做签名那天，一个第三方构建的二进制躺在包里只会更难；③ 它住在 userData、由我们 spawn，不掺进 app bundle 的签名边界，也就不需要被公证，同时天然绕开 asar 里放可执行文件那条坑。`electron/localSpeech/localSpeechPackaging.test.ts` 守的是**反方向**：哪天有人顺手把它打进包里就红。

## 里程碑与状态

1. ✅ 框架四列表登记（`docs/engineering/framework-boundaries.json`）。
2. ✅ 共用下载原语 + 删 Depth 那份主体；本地引擎五模块 + 接进 transcribe。
3. ✅ 拆解侧的转写线选择、进度 detail、失败类别与「改用云端重试」。
4. ✅ 供应链版本钉登记 + `check:supply-chain-pins` 门岗（含会红的判据测试）；R21 合同带门表。
5. ◻︎ 未完：英文真素材（本机没有，已登记欠账）、Windows 真机（测试机磁盘不够）、拆解参数行里的「转写」下拉（等批次 2 的 T-DS-13 参数行组件，socket 已留在 `payload.transcribe`）。
