# 本地转写 provider（批次 3 任务书 T-MO-11）

状态：实施中。基线 e96614e14。任务书编号与 TODO 中已完成的模型可用性任务同号，本计划以 09-17 批次 3 任务书为准，不改旧 TODO 身份。

## 用户镜头与范围

拆解视频的转写参数选择本地（离线），首次使用先告知引擎与模型下载体积，明确确认后下载。模型提供多语言 base/small/medium 三档，默认 small；按上游标称体积 148/466/1530 MB，small 相对 base 多 318 MB、相对 medium 少 1064 MB，作为中英混合输入的体积与质量折中，实际质量必须以真素材验证，不声称已达到云端质量。语言由音频自动检测，返回检测语言。长音频分段、一次重试、错误携带段号及原因，用户手动选择改用云端，无自动切换。

当前基线没有任务书提到的批次 2 转写参数组件与 Depth 下载告知组件。先实现独立后端，已向派工方请求可接入提交，禁止生成平行 UI。首次下载的 Nomi fork release、mac 签名/公证资产与 Windows 真机仍需取得实证。

范围：现有 transcribe taskKind 的声明式本地执行、统一解析、可信下载、sidecar 生命周期、分段、档案与供应链检查。复用 hardenedFetch、现有 ffmpeg、现有模型目录；不引 Python、第二个 ASR 引擎或 native addon。
回滚：逐里程碑 revert 当前分支提交；缓存仅写隔离设置目录下独立命名空间，不修改用户项目原始素材。
验收：禁止 .en、auto 语言、缺失/空结果显式报错、分段失败重试一次、sha256/磁盘/网络错误、共享解析器；再 gates 与用户指定七套测试按序执行。真实中文/英文/混合离线与云端 WER、mac/Windows、zh/en 截图缺证据即 unverified。

## 先查别人：四列表

调研正本：`/Users/aoqimin/Desktop/nomi-scratch-0917/batch3/T-MO-11-local-transcription-prior-art.md`。
实读上游：OpenWhispr `scripts/download-whisper-cpp.js:19-47`、`src/helpers/whisperCppRelease.js:1-8`、`src/helpers/whisperServer.js:497-650,865-1015`（2026-09-17）；Context7 `/ggml-org/whisper.cpp` server README 与 server.cpp。

| 它提供 | 我们用 | 我们另写 | 我们拆散 |
|---|---|---|---|
| whisper.cpp 多语言识别与 auto language | whisper-server `/inference`，verbose_json | 无 ASR 推理实现 | 不拆解编码器/解码器 |
| OpenWhispr pin 0.0.10 预编译 sidecar 与 MSVC DLL | 同样 pin、校验、spawn loopback 生命周期 | Nomi 可信资产清单、设置目录缓存、取消和错误投影 | 不照搬其多引擎/GPU 静默 fallback |
| server 分段时间戳 | 统一音频结果解析器的 segments | 长素材按 30s 整数倍窗口加重叠、全局时间偏移归并 | 不重写模型内部 30s 推理窗口 |
| 现有 depthVideoModelCache 的 hardenedFetch + SHA-256 + 原子落盘 | 提取同一下载原语供两家共用 | 文件发布清单与安装依赖检查 | 删除 Depth 独占的重复下载主体 |

## 参考实现逐层对照

| 层 | 它怎么做 | 我们怎么做 | 判定 | 若没想到补在哪个阶段前 |
|---|---|---|---|---|
| 工具 | whisper-server HTTP multipart | 同一 taskKind 调 sidecar multipart | 一致 | 无 |
| 转录渲染 | OpenWhispr 显示听写文字 | Nomi 统一 segments 归属镜头，显示检测语言和失败原因 | 有意不同：视频分镜领域 | UI 接线前 |
| 会话 | server 保温供连续听写 | 每个转写任务持有并 finally 关闭 sidecar | 有意不同：离线批量视频任务隔离 | 无 |
| 上下文 | prompt 字典与音频 | 仅音频，language=auto，不用 UI locale 强制语言 | 有意不同：用户多语言硬约束 | 无 |
| 模型与花费 | 多引擎/GPU 档 | 单引擎多语言三档，云端必须重新走付费授权 | 有意不同：单引擎裁决 | 无 |
| 控制流 | 自动 GPU fallback 与重试 | 分段重试一次，失败显式抛出；禁止自动换云端 | 有意不同：硬约束要求可见失败 | 无 |
| 扩展 API | /inference 与 /health | 仅固定 loopback endpoint、固定字段、受控二进制 | 一致 | 无 |
| 观测与测试 | 日志与健康检查 | 分段进度与错误类型、真素材与 WER、故障注入 | 一致 | 最终验收前 |
| 安全 | 固定 release，随 exe 放 DLL | 固定 SHA-256、完整安装、签名验证、限 loopback、退出回收 | 一致 | 发布资产与打包验收前 |

## HTTP 接触面裁决

`file` 派生自当前音频分段；`language` 常量 auto（用户硬约束）；`response_format` 常量 verbose_json（与云端解析契约一致）；`translate` 不用（保留原语种）；`prompt` 不用（避免 UI locale 污染）；`temperature` 上游默认；`model` 路径派生自校验通过的多语言资产；`host` 常量 127.0.0.1；`port` 派生自 OS 可用端口；`threads` 派生自主机可用核数；GPU 由已发布平台构建明确声明，CPU 路径必须告知耗时。

规范：https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md 。偏差：只开放上述请求子集，不新增上游字段；Nomi 分段进度与错误为宿主事件，不伪装为上游协议。

## 里程碑

1. 框架登记、门表、合同与会红的测试。
2. 可信下载与 sidecar/分段执行，共用解析器与目录档案。
3. 接批次 2 共用组件、显式云端重试，供应链与打包检查。
4. 指定验证全收齐、修复、真实验收、跨池复核、最终报告。每阶段独立中文 commit；不 push、不建 PR。
