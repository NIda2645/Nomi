# Beautiful UI — 第三方许可（MIT）

介入槽卡族的**外壳与版式骨架**取自 Beautiful UI（`https://www.beautifului.dev`）的
Approval Card 与 Recommendation Card。许可页：<https://www.beautifului.dev/license>
（2026-09-22 实取，页面原话第一句：**"Yes, you can use it for free."**）。

MIT 允许复制、修改与再分发，**条件是这份声明必须随副本一起保留**——所以它落在这里，
并由用到它的组件在文件头指回本文件。

```
MIT License

Copyright (c) 2026 Shane Levine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 我们取了什么、没取什么

| 取了 | 没取 |
|---|---|
| **外壳与版式骨架**：安静纸面 + 发丝线、无彩色描边、无带底色卡头条；标题=一句问话 + × 右上；页脚左下元信息、右下动作（安静次钮 + 深色主钮 ⏎） | 它的业务内容（冰淇淋补货、置信度计（Meter）、供应商 EntityChip、ValuePill 色调族） |
| Approval Card 的**交互**：一次一题、卡高随题滑动、单选点了自动前进、末行内联输入 | 它的 token 体系（`--ink-2` / `--surface` / `--green-tint`…）——全部换成 Nomi 的 `--nomi-*` |
| Recommendation Card 的**版式**：标题一句问话、正文一段、页脚左元信息右动作 | 它的正文形态（只读的一句话内嵌标签）。我们的正文是**节点参数条那个共享组件**，用户要在卡上真改参数再生成 |

源码落盘与解剖见 `docs/research/`，逐件对照表在本次任务报告的 §四 / §十。
