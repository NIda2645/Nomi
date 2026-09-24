# v0.22 用户反馈的结构评审：一个入口画出来了，别的 owner 还按旧规则拦

> 状态：已完成（2026-09-24）· 触发：`check:symptom-cluster`（src/workbench 7 天 55 份、tests/ux 5 份、docs/fixes 4 份根因合同）
> 对应合同：`docs/fixes/2026-09-24-canvas-connection-ring-dead-ends.root-cause.json`、`docs/fixes/2026-09-24-library-missing-assets-blocks-open.root-cause.json`

## 这周的合同在说同一件事

v0.22 把画布迁到 React Flow 一个内核，连线「+」圈也收成了一个 owner（`generationCanvasReactFlowVisualContract.ts`）：谁能起线谁就有圈。
但圈只是入口。入口背后还有三个**更早就存在、各自写死规则**的地方：

| 地方 | 旧规则 | 和「谁都有圈」冲突在哪 |
|---|---|---|
| `BaseGenerationNode` 卡面装饰 | 侧边时间轴拖柄放在 right -42px | 正好是右侧圈的位置，层级还更高 |
| 拖到空白处的新建菜单 | 只认 text / image | 视频、音频有圈，松手什么都不发生 |
| `completeNodeConnection` 槽满提示 | 没有槽 = 满 | 新建节点还没挂模型，次次误报 |

项目库那条是同一个形状：打开项目归打开流程（含备份恢复），项目库又加了一道「不 ready 就不让进」，成了第二个 owner，而且没有出口。

所以 `src/workbench` 这层的结构问题不是「连线代码写得不好」，而是**入口统一之后，没人回头扫一遍「这个入口承诺的事，还有谁在另外判定」**。一次统一，留下 N 个旧判据，每个都会在用户手上变成一次「看得见、用不了」。

## 这次怎么收

- 能做什么由能力派生：新建菜单的节点种类从 `connectionCreateKindsForSource`（模型档案的参考槽）派生，不再有第二张 kind 表。
- 卡片左右两侧只归「+」圈：删掉侧边拖柄，时间轴只剩顶部把手。
- 能不能打开归打开流程：项目库只在 external-change 时停一下（`syncStatusBlocksOpen`），素材归属按 URL 里的项目 id 判。

## tests/ux 这层的问题

`canvas-handles-alt-drag.walk.mjs` 一直是绿的，因为它只断言圈的 computed style（透明度、display），没断言圈**在最上层**。「样式上可见」和「用户点得到」是两件事，这次把判据换成 `elementFromPoint` 命中把手，并补上版本托盘展开这个状态。
同一类走查以后写可见性断言时，默认要带命中测试，不能只查样式。

## docs/fixes 这层

合同密度高，是因为 v0.22 迁移后这一周都在收这类冲突，不是每份合同都在修同一个 bug。下一次统一某个入口时，先照上表列出「这个入口还被谁判定」，再合入，比事后一份份补合同便宜。

## 不在本次范围、已登记

- 视频连进新视频节点时默认走「尾帧接力」（图生视频），首帧槽在生成前显示为空——发送侧是通的，但显示与默认语义（接力还是参考视频）要产品拍板。
- 展开的编组框左右也出「+」圈（用户反馈 3）：是新功能，要先拍板交互再做。
- `scripts/door-map.mjs` 的入口判断 `file://${process.argv[1]}` 在 Windows 上永远不成立，脚本静默不输出。
