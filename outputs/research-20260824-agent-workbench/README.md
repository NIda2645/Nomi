# 2026-08-24 Agent 视频工作台研究包

主报告：[2026-08-24-agent-workbench-comparison.md](./2026-08-24-agent-workbench-comparison.md)

## 目录

- `docx/manifest.json`：四份 DOCX 的总计数、文件属性、段落/表格/媒体数量
- `docx/*.md`：完整段落、表格、页眉页脚、内嵌媒体清单
- `docx/*.json`：带段落索引、表格行、关系和媒体 SHA-256 的机器可读原文
- `docx-media/`：从四份 DOCX 解包出的 276 个内嵌图片/视频/附件，保留 `word/media` 等原始路径
- `web/*.txt`：当前浏览器会话可见 DOM 文本
- `web/*.eval.json`：DOM 提取原始响应
- `source-manifest.json`：网页 URL、页面目标、字符数、截图路径
- `screenshots/*.png`：真实页面截图
- `docx-render/`：四份 DOCX 的真实页渲染图

## 截图索引

| 页面 | 截图 |
|---|---|
| MiniMax Design 官网 | `screenshots/minimax_design_home.png` |
| MiniMax Design 飞书手册 | `screenshots/minimax_manual_feishu.png` |
| 小云雀首页 | `screenshots/xyq_home.png` |
| 小云雀 Web 手册 | `screenshots/xyq_web_manual.png` |
| 小云雀创作 Agent-画布手册 | `screenshots/xyq_canvas_manual.png` |
| 小云雀运镜库手册 | `screenshots/xyq_camera_manual.png` |
| LibTV 首页 | `screenshots/libtv_home.png` |
| LibTV 画布 | `screenshots/libtv_canvas.png` |
| LibTV 使用指南 | `screenshots/libtv_use_manual.png` |
| LibTV Skill 使用指南 | `screenshots/libtv_skill_manual.png` |
| LibTV CLI 使用指南 | `screenshots/libtv_cli_manual.png` |
| LibTV CLI 官网 | `screenshots/libtv_cli_home.png` |
| TapNow Brainstorm 文档 | `screenshots/tapnow_brainstorm.png` |
| TapNow 当前画布 | `screenshots/tapnow_canvas.png` |
