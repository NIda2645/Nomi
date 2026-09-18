# 复核与复现

- 被测：`8d95b910305f724213c69224fa07b51fcc663cd1` 的真实 Electron 构建，macOS arm64，1280×933；未改生产代码。
- 环境：本任务 worktree 的 `.tmp/skillreach/profile-{b,c}`；Q3 使用实际界面新建空项目，模型 apimart / deepseek-v3.2。用户设置/catalog 的加密凭据只复制到隔离目录，未进入提交。
- Q1：三次冷启动，点击/文件选择使用 Playwright 用户控件；无状态注入，无 `win.reload()`。拖拽只做到 Chromium CDP 文件拖入，不冒充 Finder 手势。`q1-c.json` 是开屏动画仍在时的预试，正式拖入结果看 `q1-drop.json`。
- Q2：`external-packages.json` 固定三家仓库的 commit 与目录；按原目录打 zip 后由“导入文件”的真实 filechooser 输入。没有使用本仓 `tests/fixtures/standard-formats/agent-skill`。`q2-package-files.json` 列出保留/跳过的每个脚本与差异。5 轮均手动挂技能，新会话。
- Q3：`q3-cases.json` 在第一个模型请求之前提交（Q1 里程碑）。`run-cases.mjs` 从真实 textarea 输入，点击发送，等待生产 trace 的终态，180 秒观察窗包含用户确认暂停。超时如实保留，停止后取终态；不将半段输出当完成。
- 不将模型自己说“读过了”当工具轨迹。`rounds/*.json` 的 trace 来自隔离项目 `.nomi/agent-sessions/*/*.trace/trace.jsonl`。工具结果摘要可能被生产 trace 截断，完整结果在下一次出站 wire 的 tool 消息中。
- `observe-transport.mjs` 只在本任务拥有的 Electron 主进程 attach。包装真实 appFetch，保留消息正文和响应，不记录 header/API key。普通轮次不改变消息/工具内容（JSON 解析后重新序列化），阳性对照仅从 system 的 `<available_skills>` 删目标 `<skill>` 条目；原始与发出请求都保存，删除数不是推测。
- 原始 wire 用 gzip JSONL 保存：每行 `{file, content}`；content 是原请求/实际发出请求/原始 SSE 响应原文。`summarize-wire.py` 从未压缩工作目录提取逐请求调用与 usage，不能以文本输出冒充 tool call。
- 图像是该构建的真实截图；PDF 为该回合生成的文件，另有 pdftotext 与渲染验证。第三方技能包未再分发；按固定 revision 可重新下载。

## 数字的边界

Q2 是有目的选的 5 个包，Q3 单一模型每题一次主样本，Q4 是从 66 条中有目的抽 10 条，不作总体成功率估计。`22/88` 只表示文件名出现在测试/走查路径的文本里，不能冒充测试执行覆盖率。`60/88 description 与摘要不同` 也只表示两份文本，不代表 60 个语义错误。

模型给出的安装脚本只在隔离项目里通过真实审批 UI 尝试。未批准 `pip --break-system-packages`。媒体报价卡没有获批，没有以生图/生视频成功冒充技能效果。
