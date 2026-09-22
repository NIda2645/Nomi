# 结构评审：`src/desktop` 的桥类型是手抄的契约镜像

> 触发：`check:symptom-cluster` —— 2026-09-17 到 2026-09-22 的 7 天里，`src/desktop` 这一层出现了第三份根因合同。
> R21 的规矩：第三份合同是「这一层结构不对」最便宜的证据，不是再修一次的理由。
> 本文只做结构判断，不改代码。

## 1. 三份合同，同一个位置

| 合同 | class_root（各自的） | 它改的 `src/desktop` 文件 | 为什么会改到这里 |
|---|---|---|---|
| `2026-09-17-mcp-launcher-ownership` | 自动修复分不清「坏掉的资源」与「另一个可用的 owner」 | `mcpBridgeTypes.ts` | 主进程那边的 MCP 契约变了 |
| `2026-09-17-project-artifact-storage-and-projection` | 存储 / 落位 / 传输投影三件事被揉在一起 | `bridge.ts` | 主进程那边的产物契约变了 |
| `2026-09-22-shot-cut-truncation`（本次） | 「给全了没有」这份状态没有跨进程 owner | `bridgeMedia.ts` | 主进程那边的切点契约变了 |

三份合同的 class_root 彼此**毫无关系**。但它们改到 `src/desktop` 的原因是**同一个**：

> 主进程的某个契约变了，于是必须去 `src/desktop` 手动改一份对应的类型。

也就是说，`src/desktop` 在这三次里都**不是出问题的地方**，而是**每次都要跟着改的地方**。这正是「同一个语义有两份定义」的典型长相（R14.1）。

## 2. 数字

`src/desktop` 共 1841 行。其中：

- `bridge.ts` 432 行里有 **42 处**内联的 `Promise<{ … }>` 结构字面量；
- `bridgeMedia.ts` 181 行里有 **11 处**；
- 真正从 `electron/shared/**` import 回来（= 这个语义在别处有 owner）的只有 **9 个文件、各 1–4 处**。

对比一下本次改动前后的同一个字段就看得很清楚：

**改之前**（`bridgeMedia.ts`，手抄）：
```ts
}) => Promise<{
  cuts: { seconds: number; score: number }[]
  …
  truncated: boolean          // ← 和 electron/video/detectShotCuts.ts 各写了一遍
}>
```

**改之后**（引用 owner）：
```ts
import type { DeconstructionProgress, ShotCutCoverage } from '../../electron/shared/canvas/shotTable'
…
coverage: ShotCutCoverage     // ← 只有一份定义
```

## 3. 结构判断

**这不是 `src/desktop` 自己的 bug，是它的职责被定义错了。**

桥文件今天同时干两件事：

1. **声明这条 IPC 通道存在**（方法名、参数形状）——这是它该干的；
2. **复述通道两端传的是什么类型**——这是它不该干的，因为那个类型在主进程已经有主了。

第 2 件事没有任何机制保证两份会一起改。TypeScript 在这里帮不上忙：两边是两个**结构上相容**的匿名类型，主进程加一个字段，渲染层那份不加，**编译照样过**——只是渲染层永远看不见那个字段。

本次的 bug 正是这个机制的一个实例：`truncated` 在主进程算好了，在桥的类型里也抄了一份，但**拆解那条路的结果类型里没有它**，于是读侧永远读不到。三份合同里至少两份（本次 + artifact projection）都踩在这条缝上。

## 4. 建议（不在本次做）

按代价从低到高：

1. **短期（棘轮）**：给桥文件加一条门岗——`src/desktop/bridge*.ts` 里新增的内联结构字面量只减不增，新字段必须 `import type` 自 `electron/shared/**`。这是纯登记式棘轮，和 `check:framework-surface` 同一套形状，成本最低。
2. **中期**：把还没有 shared owner 的那些契约逐个上提到 `electron/shared/**`（本次的 `ShotCutCoverage` 就是这么做的），桥只留方法签名。42 + 11 处内联可以按模块分批清。
3. **长期**：从 preload 的真实 handler 签名**生成**桥类型，桥文件退化成一份生成物。代价最高，且要先做完第 2 步才划算。

**不建议**现在动第 3 步：三份合同还不足以证明生成器的投入值得，而第 1 步就能止住「新的手抄」。

## 5. 本次没做的

- 没有改任何桥文件的既有内联类型（只把本次碰到的那一处换成了 `import type`）。
- 没有加第 1 步那条门岗——那是独立的一件事，要先验它会红（R17），不该塞进一个切点修复里。
- 没有扫 `src/desktop` 全部 53 处内联字面量逐个判断哪些已有 owner、哪些没有；上面的数字是文件级统计，不是逐处判定。
