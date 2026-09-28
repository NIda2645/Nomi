# 镜头身份真机验收

脚本：`tests/ux/canvas-shot-identity.walk.mjs`。使用现有 `_launchApp.mjs`、`_mcpJourney.mjs` 与已登记真实媒体，不新增运行器。

运行命令：

```sh
NOMI_REAL_MEDIA_DIR=/Users/aoqimin/Desktop/视频 node tests/ux/canvas-shot-identity.walk.mjs
```

输入为用户真实 4K HEVC 视频的第 5 秒照片与 2 秒片段，放入隔离项目的 generated-result 恢复夹具。旧项目包含首帧/视频同号 1，以及误用号 1 的独立图片。此夹具验证恢复与后续真实 UI 操作，不代表真实供应商生成。

验收任务：

1. 打开旧项目：首帧/视频均显示“镜头 1”，分别标“首帧图 / 视频”；独立冲突图片修为“镜头 2”。媒体实际解码后截图。
2. 真实 Shift 多选、Cmd/Ctrl+C/V 复制配对：副本均为“镜头 3”，角色不同；拖动副本组不改编号。
3. 真实设置切为英文：显示“Shot 1 · First frame / Video”及副本“Shot 3 · First frame / Video”。
4. 真实 MCP stdio 执行 `nomi_session_open` → `nomi_read(target=canvas)`：副本首帧的 `shotOwnerNodeIds` 只包含副本视频 nodeId，不指向原视频。
5. 等待项目落盘，重新加载并打开：全部节点编号与角色不变。

证据输出：`tests/ux/shots/canvas-shot-identity/`：

- `01-paired-restored-zh.png`：恢复后的中文配对与冲突修复。
- `02-copied-new-shot-zh.png`：复制副本新号。
- `03-paired-en.png`：英文配对。
- `04-reopen-stable-en.png`：重新打开后稳定。
- `canvas-read.json`：实际工具结构化回执。
- `mcp-trace.jsonl`：真实工具轨迹，临时 leaseHandle 脱敏。
- `journey.json`：每个真实任务的断言结果。

验收限制：providerCalls=0、paidCalls=0；没有付费生成、没有 LLM 决策回合。本走查不覆盖模板插入、LOD 及 compact prompt 投影，这些不能以本组截图替代测试。最终生产基线为 `dbd907cd9be41b605627882d9eef5106a14cbd72`（已含媒体比例修复）。`pnpm run build` exit 0；完整走查 exit 0。构建日志 `/tmp/nomi-shot-identity-walk-build-merged.log`。


## 亲眼核验与结果

2026-09-20 在 macOS Electron 本构建亲眼查看复制后的中文、英文、重开截图：原配对“1”在上方，独立图片“2”在左下，副本配对“3”在右下。五个身份徽标全部可见，首帧图/视频文字不截断；拖动后的截图已等多选浮条关闭，未以被遮挡 DOM 当作视觉验收。

真实 MCP 共执行 2 次 tools/call：`nomi_session_open` 成功，`nomi_read` 成功（2/2）；canvas.read 返回 5 个节点、2 条 first_frame 边。脚本硬断言副本首帧和副本视频都是镜头 3，首帧 role 为 first_frame，owner 只为副本视频 id。工具读取/指代正确；不报告 LLM 回合成功率，因为本轮没有模型回合。

等待门岗收尾：移除走查内两处固定 20 秒预算，采用现有 Page / expect 默认等待。`pnpm run check:test-waits` exit 0（new/stale=0），同一完整 walk 补跑 exit 0；没有提高基线或改测试基础设施。
