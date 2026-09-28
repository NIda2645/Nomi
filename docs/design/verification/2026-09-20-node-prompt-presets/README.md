# 节点预设恢复 · 真机证据

状态：本地已验证，待 PR 合入。

同一隔离 Electron 工作区，通过实际鼠标、键盘创建项目、节点和个人提示词。没有注入应用 store，没有付费生成。截图对应任务分支的 build；不是 mockup。

| 对照 | 证据 |
|---|---|
| 原文字效果菜单 | [before](before-zh-light.png) |
| 统一搜索/分类/分组与真实配图预览 | [预览](after-effect-media-preview.png) |
| 我的库新建后原节点立即可选 | [刷新](after-personal-refresh-zh-light.png) |
| 英文暗色与个人提示词图标 | [en/dark](after-en-dark.png) |
| Agent 仍使用同一 Skill 选择体验 | [Skill](after-agent-skill-shared-picker.png) |

[journey.json](journey.json) 记录完整正常路径；[supplemental.json](supplemental.json) 记录公共预设插入撤销与媒体解码。未执行生产真实网络故障或付费生成；IPC 读取失败由单测验证，不把它算成 live。
