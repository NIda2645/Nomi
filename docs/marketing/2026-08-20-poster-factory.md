# 图文营销工厂：分镜表 + 工作流

> 日期：2026-08-20 · 服务于 `2026-08-20-marketing-execution-v2.md` 的**线 A 中文周更**
> 文案真相源：`2026-08-02-intro-copy-kit.md`（发之前过它的 §6 宣称红线）
> 分镜表数据：`docs/marketing/poster-shotlist.json` · 渲染器：`scripts/render-marketing-posters.mjs`

---

## 0. 结论先行：为什么是「AI 出底板 + 程序化贴真」两层

原始设想是「全部交给 Nomi MCP 图生图，用参考图控风格」。**实测后否掉了一半**，理由是三条硬事实，不是偏好：

**① AI 图生图会重绘截图，不是贴图。**
把产品截图当参考图喂进去，模型是「照着重画一遍」，不是「原样放进去」。重画出来的界面，按钮、文字、图标全是模型编的——那不是 Nomi，是 AI 想象的 Nomi。发出去就是信任事故，也违背我们自己写的宣称红线精神。

**② 文字赌不起。**
2026-08 实测数据：GPT-Image 2 / Seedream 5 Pro / Nano Banana 2 英文渲染 100%，Qwen-Image 2.0 中文 90%。中文 90% 意味着**每 10 张有 1 张标题写错字**，批量出 20 张就有 2 张废掉，还要人眼一张张查。而「谷歌搜索框里必须是 GitHub Nomi」是硬要求，错一个字母整张作废。

**③ 付费闸按「真人逐张审批」设计，批量走不通。**
`electron/spendGrant.ts:79` 每次生成都校验授权令牌，`maxAttemptsPerNode` 只支持**同一节点重试 N 次**，不支持**一次授权跑 N 个节点**。`autoContinueWithinBudget` 只作用于 playbook 编排，管不到 `nomi_generate` 单次调用。而 Claude Code 不声明 elicitation 能力，弹窗路径在它身上不触发。**结论：纯 MCP 批量出图，在 Claude Code 下跑不动。**

### 所以分工是

| 层 | 干什么 | 用什么 | 花额度 | 要点确认 |
|---|---|---|---|---|
| **L1 底板** | 背景、氛围、光影、装饰主视觉——**没有精确文字、没有真实 UI 的部分** | Nomi MCP 图生图 + 参考图锁风格 | 是 | 是（每次） |
| **L2 贴真** | 真实产品截图（原像素）、全部文字、谷歌搜索框 | `scripts/render-marketing-posters.mjs`（Playwright） | 否 | 否 |

**用户的原意保住了**：Nomi MCP 仍是主生成引擎，参考图仍然是控风格的手段——只是它负责「底」，不负责「字」和「截图」。

**批量的体验变成**：一套底板生成 1 次（点 1 次确认）→ 6 张海报几秒钟全自动合成 → 改文案只改 JSON 重跑，不重新花钱。

---

## 1. 实测记录（2026-08-20，装机版 v0.20.0）

| 模型 | 参考图 | 结果 |
|---|---|---|
| apimart / doubao-seedream-5-0-pro | ✗ | 「在这个接入方式下发不出：参考图」——运行时拒发（省了钱） |
| apimart / gemini-2.5-flash-image-preview | ✗ | 同上 |
| apimart / qwen-image-2.0 | ✗ | 同上 |
| kie / gpt-image-2-image-to-image | — | **API key 未配置**（`nomi_list_models` 会列出来，但发不出） |
| kie / nano-banana | — | 同上 |
| modelscope / Qwen/Qwen-Image-Edit-2511 | ✓ | 参考图校验**通过**，卡在付费确认闸 |

> ⚠️ 源码 `electron/catalog/apimartImages.ts` 里这几个模型都配了 `image_urls`，但装机版运行时拒发——**MCP server 就是装机 app，源码改动要重新打包才生效**。调试要以运行时为准。
>
> **参考图必须是 URL**，本地文件 MCP 导不进去（`importLocalFile` 未暴露成 MCP 工具）。绕法已验证：素材在公开仓库里，直接用 GitHub raw 链接，`curl -I` 返回 200 可达。

**当前 L1 底板的可用路径**：modelscope / `Qwen/Qwen-Image-Edit-2511`，需人工点确认。要解掉「每次都点」，得给 kie 配 key 或等打包更新。

---

## 2. 分镜表（`poster-shotlist.json`）

一行 = 一张海报。改文案只改这个文件，不碰渲染器。

| id | 系列 | 版式 | 标题 | 截图 |
|---|---|---|---|---|
| `A1-one-project` | 核心主张 | 竖 3:4 | 一个项目，**不是十一个标签页** | canvas |
| `A2-same-person` | 核心主张 | 竖 3:4 | 第 4 个镜头和第 9 个镜头，**得是同一个人** | canvas |
| `A3-bring-your-own` | 核心主张 | 竖 3:4 | 模型你自己带，**密钥不上传** | script |
| `B1-agent-can-operate` | 功能迭代 v0.20 | 竖 3:4 | 你的 AI 助手，**能真的操作它** | agentic |
| `B2-3d-stage` | 功能迭代 v0.20 | 竖 3:4 | 先摆好机位，**再让模型开拍** | 3d |
| `B3-real-timeline` | 功能迭代 v0.20 | 横 16:9 | 不是在浏览器里**假装在剪辑** | timeline |

**两个系列的分工**：
- **A 系列 = 核心主张**，不随版本变，长期复用，是「不变的底层结构」那条切入点
- **B 系列 = 功能迭代**，跟着版本走，每次发版新增 2-3 条

**每条 spec 的字段**：`id / series / format / eyebrow / headline[] / emphasisLine / sub / screenshot / board / searchQuery / hint`。
`board` 为空 = 纯 ink 底；填上 L1 生成的底板路径就自动叠加氛围层 + 遮罩。

---

## 3. 版式规范（已渲染验证，不是纸上设计）

调研自 Linear / Stripe / Raycast / Apple 的可复制手法，落成两种版式：

**竖版 1080×1440（小红书/抖音）** —— 三段分明，各有实底，互不重叠：
```
品牌条（logo + Nomi + eyebrow 胶囊）
超大标题（两行，第二行橙色强调）
副标题（60% 不透明度）
────────────────────
截图舞台：真实截图，-6° 倾斜，右侧出血，底部渐变淡出到 ink
────────────────────
搜索区（独立黑底）：白色胶囊搜索框「GitHub Nomi」+ 引导小字
橙色底条 16px
```

**横版 1600×900（B站/X）** —— 左右分栏 53% / 47%，左文案+搜索框，右截图。

**硬规矩**（踩过才写下来的）：
- **搜索框必须有自己的地盘**，不许压在截图上——第一版就是压着的，脏
- **截图旋转以左上为原点，右上角会被抬起来**，`top` 必须留够，否则爬进副标题
- `.stage` 必须 `overflow:hidden`，否则截图溢出到搜索区、渐变淡出失效
- 全图只有 ink / paper / 一个橙色强调，强调色面积 < 15%
- 单一字体族，禁渐变、禁 emoji、禁多层浓重投影

**配色真相源**：营销侧用 `#171715` ink / `#f4f2ec` paper / `#b83c24` 锈红 / `#ef6a49` 橙，与 `scripts/marketing/social-card.mjs` 同源。**注意这套和 app 内的 UI token（accent 蓝紫）不是一套**，别混。

---

## 4. 批量工作流

```bash
# 出全套（当前 6 张，约 20 秒）
node scripts/render-marketing-posters.mjs

# 只出指定几张
node scripts/render-marketing-posters.mjs A1-one-project B2-3d-stage
```

输出 `marketing/assets/posters/<id>.png`，1080×1440 @2x（实际 2160×2880）。

**每次发版的动作**（约 10 分钟）：
1. 更新产品截图 → `marketing/assets/screen-*.png`
2. 在 `poster-shotlist.json` 加 2-3 条 B 系列新条目，文案从 intro-copy-kit 取或新写后过红线
3. `node scripts/render-marketing-posters.mjs`
4. 人眼过一遍，发小红书 / B站 / 即刻

### 加氛围底板（L1，可选）

**通路已验证**：spec 填 `board` 后，底板以 `opacity:.5` 铺满，上面盖一层 165° 渐变遮罩压到纯 ink，文字与截图可读性不受影响。用 `marketing/assets/demo-poster.jpg` 实渲染确认过。

**但现在生成不了**：见 `docs/qa/2026-08-20-mcp-issues.md` 的 M3——经 Claude Code 的 MCP，付费生成 100% 发不出，不是「点一下就行」。**底板只能在 Nomi GUI 里手动生成**，或等 M3 修好。

**GUI 里生成底板的提示词**（竖版选 9:16，横版选 16:9；出完存到 `marketing/assets/boards/<name>.png`，spec 里填路径即可）：

```
抽象氛围背景，无任何文字、无任何界面元素、无人物。
深暖灰近黑色（#171715）为主调，画面右上方有一束极柔和的暖橙色光晕（#ef6a49），
强度很低，像是暗房里远处的一盏灯。整体极简、大量纯净暗部、轻微胶片颗粒。
不要渐变色带，不要几何图形，不要网格，不要科技感线条，不要发光粒子。
质感参考：高端产品发布会主视觉的背景板，克制、昂贵、留白。
```

变体做法（保证系列一致）：把第一张出好的底板当参考图，改一句「光源移到左下」「光晕换成更冷的灰蓝」，出 3-5 张同源变体。
> ⚠️ 参考图这条也被 M1 挡着（内置家经 MCP 发不出参考图）——但 **GUI 里是好的**，UI 路径会正确投影参数键。所以底板全流程走 GUI 即可。

**先不填也完全成立**：当前 6 张都是纯 ink 底，已经够干净。底板是锦上添花，不是前置依赖。

---

## 5. 待办

- [ ] 给 kie 配 API key，解锁 GPT Image 2 i2i / Nano Banana（英文文字 100%，做底板更强）
- [ ] 「一次授权、批量生成」是真实产品缺口——我们自己的营销都卡在这，真实用户批量出图一样卡。值得排进产品 backlog
- [ ] 底板系列：出 3-5 张风格统一的氛围底板，用同一张参考图锁风格，作为 A/B 两个系列的视觉基底
