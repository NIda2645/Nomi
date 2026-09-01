# 2026-08-24 Agent 视频工作台研究包（已策展）

主报告：[../2026-08-24-agent-workbench-comparison.md](../2026-08-24-agent-workbench-comparison.md)
索引 + 结论 + 现状对账：[../2026-08-24-agent-workbench-index.md](../2026-08-24-agent-workbench-index.md)

> 本目录是**策展后的留存件**：只保留不可再生的一手文本证据（竞品手册全文提取 + 竞品页面 DOM 文本）。
> 原始的截图、DOCX 内嵌媒体、页面渲染图、机器可读 JSON（共约 505 个文件、约 21MB）已删除——它们是可再抓/可从 DOCX 重解包的副产物，且永久保存在 git 历史里。
> **回捞原始证据**：删除前的完整研究包在 `outputs/research-20260824-agent-workbench/`，位于提交 `ba838b77da07ce7d6a59534efb296cea0344a2c3`（PR #268 内容首次落盘于 `e6f18ca8`）。
> 例：`git show ba838b77:outputs/research-20260824-agent-workbench/screenshots/libtv_canvas.png > /tmp/x.png`。

## 保留的文件（本目录）

- `docx/*.md`：四份竞品手册（`python-docx` 提取的**逐段正文 + 表格 + 内嵌媒体清单**）——原始 DOCX 来自 `~/Downloads` / 微信临时目录，已不存在，这是唯一留存。
  - `LibTV.md`（LibTV 使用指南，536 段 / 81 表 / 204 媒体）
  - `LibTV_CLI.md`（LibTV CLI 使用指南）
  - `LibTV_skill.md`（LibTV Skill 使用指南）
  - `MiniMax_Design_-.md`（MiniMax Design 手册与指南，128 段 / 54 表 / 59 媒体）
- `web/*.full.dom.md` / `web/*.txt`：抓取当时各竞品页面的**可见 DOM 文本**（登录会话内、未绕权限）。产品页会随时间改版，这是 2026-08-24 的定点快照。

## 已删除（可从上面的 SHA 回捞）

- `docx-manifest.json` / `docx/*.json` / `source-manifest.json` / `web/*.eval.json` / `web/*.screenshot.json`：机器可读原文与提取响应（`.md`/`.txt` 是其人读蒸馏）。
- `docx-media/`：从四份 DOCX 解包的 276 个内嵌图片/视频/附件（保留 `word/media` 原始路径）。
- `screenshots/*.png` / `docx-render/`：真实页面截图与 DOCX 页渲染图（主报告已人工核对过代表性截图，结论已写入报告正文）。

## 页面 → 原始截图路径（在 `ba838b77` 历史里）

| 页面 | 保留文本 | 原始截图（历史） |
|---|---|---|
| MiniMax Design 官网 | `web/minimax_design_home.full.dom.md` | `screenshots/minimax_design_home.png` |
| MiniMax Design 飞书手册 | `web/minimax_manual_feishu.full.dom.md` | `screenshots/minimax_manual_feishu.png` |
| 小云雀首页 | `web/xyq_home.full.dom.md` | `screenshots/xyq_home.png` |
| 小云雀 Web 手册 | `web/xyq_web_manual.full.dom.md` | `screenshots/xyq_web_manual.png` |
| 小云雀创作 Agent-画布手册 | `web/xyq_canvas_manual.full.dom.md` | `screenshots/xyq_canvas_manual.png` |
| 小云雀运镜库手册 | `web/xyq_camera_manual.full.dom.md` | `screenshots/xyq_camera_manual.png` |
| LibTV 首页 | `web/libtv_home.full.dom.md` | `screenshots/libtv_home.png` |
| LibTV 画布 | `web/libtv_canvas.full.dom.md` | `screenshots/libtv_canvas.png` |
| LibTV 使用指南 | `web/libtv_use_manual.full.dom.md` | `screenshots/libtv_use_manual.png` |
| LibTV Skill 使用指南 | `web/libtv_skill_manual.txt` | `screenshots/libtv_skill_manual.png` |
| LibTV CLI 使用指南 | `web/libtv_cli_manual.txt` | `screenshots/libtv_cli_manual.png` |
| LibTV CLI 官网 | `web/libtv_cli_home.full.dom.md` | `screenshots/libtv_cli_home.png` |
| TapNow Brainstorm 文档 | `web/tapnow_brainstorm.full.dom.md` | `screenshots/tapnow_brainstorm.png` |
| TapNow 当前画布 | `web/tapnow_canvas.txt` | `screenshots/tapnow_canvas.png` |
