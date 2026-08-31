# ComfyUI 工作流设置滚轮缩放验收

> 历史阶段记录：以下为鼠标滚轮阶段的行为与证据。后续已接入共享 Mac 手势偏好，最新构建与交付状态见 [PR 验收汇总](2026-08-26-comfyui-pr-verification.md)。

日期：2026-08-26。基线：0.20.1 / `84abca8d`。
工作树：`/Users/aoqimin/Desktop/Nomi-comfyui-workflow-matrix`。
分支：`codex/comfyui-workflow-matrix-20260825`。
已实现并验证，未 commit、push、创建 PR，未发布给用户。

## 行为

- 截图指定的「工作流设置」节点图直接滚轮缩放，不需 Ctrl；鼠标所在的内容点保持原位。
- 保留 30%–200% 上下限、现有 +/-、适应和空白拖动；边拖边缩放不被旧拖动起点拉回。
- 图与列表切换、关闭重开后监听有效且不重复。左侧参数、节点列表和菜单各自滚动。
- 沿用截图布局，未增加控件。滚轮灵敏度从生成画布既有纯函数提取复用，没有新增图库，也没有改主生成画布手势设置。
- 同入口走查修复两处旧问题：目录未加载时错误清除指定工作流；放大后靠下节点菜单被裁切。目录增加按后端区分的 ready；菜单按实测高度限制在可见范围，长菜单内部滚动，聚焦不带动外层。

## 测试证据

| 层次 | 验收 | 结果 |
|---|---|---|
| 纯函数 | 鼠标锚点不变、钳位不漂移、放缩可逆；像素/行/页单位、细粒度触控板增量、零增量；既有生成画布几何 | 3 文件 29 项通过，其中本次新增 11 项 |
| 小图 | 5 节点普通滚轮、节点悬停缩放、点击菜单、边拖边缩放、Ctrl 滚轮、上下限、+/-/适应 | 正式 Electron 通过 |
| 多节点配置 | 48 节点缩放和侧栏滚动隔离；找到节点并暴露 height，保存后实际目录包含该绑定 | 通过 |
| 大图与菜单 | 80 节点默认列表滚动；三次图/列表切换无重复监听；30 额外参数的合成自定义节点菜单内部可滚到底，列表不被带动；列表滚动时菜单仍在边界内 | 通过 |
| 可见边界 | 200% 下靠底节点的最后菜单项完整；打开菜单前后画布矩形、scrollLeft/scrollTop 不偏移 | 通过，截图人工检查 |
| 冷启动 | 从设置行直接打开非第一条的 48 节点工作流；浅色滚轮缩放；已保存 height 仍勾选 | 通过 |
| 前一轮修复回归 | 视频分类、实际 JSON 导入、长模型名搜索/键盘/焦点、短枚举、冷启动保存；真实 UI 发请求，经模拟 HTTP 返回可解码视频 | 完整走查通过；不是 GPU 推理 |
| 全仓质量 | 文件体积、token、i18n、安全、lint、类型检查、单测、生产构建 | `pnpm run gates` exit 0；753 文件 / 6617 测试通过，1 文件 / 1 测试跳过 |

Lint 为 0 error、97 个存量 warning；测试类型 src 0 错，electron/evals 存量 111 个在基线内。

独立代码/体验复核通过：审查者复跑范围单测 29/29，并检查最终完整日志、200%菜单、长菜单和浅色冷启动截图，未发现剩余高置信 P0–P2 问题。新增文件指定安全扫描、脚本语法检查和 `git diff --check` 通过；暂存区为空，HEAD 保持基线未变。

先红后绿记录：

- 原版 wheel 后缩放仍为 1，`/tmp/nomi-comfy-wheel-red.log`。
- 初始锚点测试 7 项失败，wheel 工具测试因实现尚不存在失败；实现后全部通过。
- 冷启动应打开 48 节点却实际打开 5 节点，`/tmp/nomi-comfy-wheel-open-red.log`。
- 200% 菜单最后项底部 820，超过视口底部 805.5，`/tmp/nomi-comfy-wheel-menu-red.log`。

最终日志：

- `/tmp/nomi-comfy-wheel-final-gates.log`：完整 gates exit 0。
- `/tmp/nomi-comfy-wheel-acceptance.log`：最终串行完整走查 exit 0，三段 PASS（滚轮/浅色冷启动/原有反馈到视频闭环）。
- 一次并行运行在 Electron/Playwright 冷启动握手阶段出现 `Runtime.evaluate: Cannot find context with specified id`，该轮未计为完整通过；构建结束后串行原脚本完整重跑通过。没有吞错或改动依赖来绕过它。

最终截图目录：`/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-88rxRe/shots/`。

- `zoom-00-before-dark.png` / `zoom-01-node-anchor-dark.png`：原布局与节点锚点缩放。
- `zoom-01c-bottom-menu.png`：200% 节点菜单完整可见。
- `zoom-02-many-nodes-dark.png`：48 节点配置保存。
- `zoom-02b-long-menu-list.png`：长菜单最后参数与独立滚动条。
- `zoom-03-saved-field-light.png`：浅色冷启动、指定工作流、字段保留。

## 复跑与边界

```bash
pnpm exec vitest run src/ui/onboarding/comfyuiGraphGeometry.test.ts src/utils/wheelZoom.test.ts src/workbench/generationCanvas/components/generationCanvasGeometry.test.ts
pnpm run gates
node tests/ux/comfy-workflow-feedback.walk.mjs
```

构建与 Electron 走查串行运行。测试使用正式构建入口、既有隔离启动器、临时项目/目录/本机模拟 HTTP 服务；未写入真实用户资料，未调用付费 GPU 服务。本轮是画布交互验证，不构成用户私有 H3 或所有第三方工作流的真实推理保证。

实现依据与范围：[执行计划](../plan/2026-08-26-comfyui-workflow-wheel-zoom.md)。官方资料：[React useEffect](https://react.dev/reference/react/useEffect)、[MDN wheel](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)、[WheelEvent deltaMode](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode)。
