# 结构评审：`electron/settings` 为什么七天里攒了五份根因合同

日期：2026-09-15 · 触发者：`check:symptom-cluster`（同一模块 7 天内 ≥3 份根因合同）
被点名的模块：**`electron/settings`**
起因合同：`docs/fixes/2026-09-15-feedback-loop-intake.root-cause.json`（反馈回路的出站 IPC）

> 门岗那句话写得很准：「第三份合同是『这一层的结构不对』最便宜的证据，不是再修一次的理由。」
> 这份评审就是去回答：**这五份到底是同一个结构问题的五个症状，还是五件各自独立的事？**
> 结论是**后者偏多、但有一条真的共性**，而那条共性值得单独修一刀。

## 五份合同都在说什么

| 日期 | 合同 | 它的类根因（原话摘要） |
|---|---|---|
| 09-09 | `attention-sound` | 引入一个声音偏好与播放 owner，同时保留既有两个通知生产者 |
| 09-09 | `quote-bound-spend` | 付费授权缺一条「每次提交都绑当前那张已确认报价」的共享不变量 |
| 09-10 | `agent-trace-rebuild-boundary` | 可重建视图的隐私决定必须住在它的权威来源里，临时 owner 要按源文件定域而不是按可搬运的标识 |
| 09-11 | `catalog-read-channels-reseed` | 「读目录前先补种子」这条不变量**没有持有者**，散成每个处理器里的一行手写调用；五条读频道只有一条做了 |
| 09-15 | `feedback-loop-intake`（本 lane） | 「渲染层可达 + 会出站」的新通道必须同时绑来源信任与入参结构守卫 |

## 它们是同一件事吗

**三份不是。** `attention-sound` 是「同一语义两个生产者」（词表 owner 问题）、
`quote-bound-spend` 是花钱边界的授权语义、`agent-trace-rebuild-boundary` 是派生视图的隐私定域。
这三条的共同点只有「代码恰好落在 `electron/settings/` 这个目录下」——而这个目录之所以吸引它们，
是因为**它是全仓 IPC 的注册总口**（`registerSettingsIpc.ts` 里 14 次 `registerXxxIpc()`，
同目录 11 个 `*Ipc.ts`）。按目录聚类会把「注册在这里」误判成「根因在这里」。

**两份是同一件事。** `catalog-read-channels-reseed`（09-11）与本 lane 的 `feedback-loop-intake`
（09-15）说的是同一句话的两半：

> **一条 IPC 频道在开张之前必须满足的前置条件，今天没有任何一层持有它；
> 它靠每个写新频道的作者自己记得。**

- 09-11 那条的前置条件是「读目录前先补种子」——五条读频道里只有一条做了。
- 本 lane 那条的前置条件是「绑来源信任 + 收入参形状」——本次实扫七个入口全都做了，
  但**做到的原因是 `check:ipc-sender-binding` 这道会响的检测器**，不是装配层强制的。
  也就是说：有检测器的那一半（来源信任）没漏，没检测器的那一半（入参守卫）纯靠自觉。

## 这一刀该切在哪（建议，不在本 lane 做）

`registerSettingsIpc.ts` 现在是一张**平铺的调用清单**：14 行 `registerXxxIpc()`，每个被调者
自己决定要不要绑来源、要不要收入参、要不要补前置状态。装配层知道「有哪些频道」，却对
「每条频道开张的条件」一无所知——所以它没法强制任何事。

最小的结构改动是把「注册一条频道」从**一句调用**变成**一次申报**：

```
registerChannel({
  channel: 'nomi:feedback:send',
  trust: 'window-only',          // 由装配层统一 assertTrustedSender，不再每个 handler 自己写
  input: isFeedbackReportRequest, // 没有守卫就注册不上（类型上必填）
  prerequisites: [ensureCatalogSeeded],  // 09-11 那条不变量的持有者
  handler: …,
})
```

收益不是少写几行 `assertTrustedSender`，而是**让「忘了」变成编译不过**（R28：能让编译器拦的
别留给门岗，能让门岗拦的别留给人）。今天这三件事各由一道门岗或一个人的记性守着；
申报式注册把它们收进一个类型里。

代价也要说清：14 个注册点要逐个搬，且 `*Ipc.ts` 里有几个不是纯 handler（`assetRelaySettings`
还做运行时 hydrate）。所以这是**一刀独立的活**，不该夹在任何功能 lane 里。

## 本 lane 为什么仍然可以继续

门岗要的是「先出结构评审，再继续修」，不是「先做完重构」。本 lane 的合同判的是 `one_off`，
理由写在合同里：它要的那条不变量（来源信任）已经有一道会响的检测器覆盖全仓 895 个源文件，
本次七个入口实扫全绿。**它不是那个结构问题的新增症状，它是被那道检测器接住的一例。**

真正该记下来的是这份评审指出的那半个缺口：**入参守卫没有检测器**。
本 lane 的两条新通道各自带了 `isFeedbackReportRequest`，但那是作者自觉，不是结构保证。
这一条写进上面的建议里，等那一刀。

## 待办（登记，不在本 lane）

- [ ] `registerChannel` 申报式注册：把来源信任、入参守卫、前置条件从 14 个调用点收进装配层。
- [ ] 给「入参守卫」补一道检测器（`ipcMain.handle` 的 handler 里没有任何形状守卫就报红），
      它是 `check:ipc-sender-binding` 缺的那半边。
- [ ] `check:symptom-cluster` 自身的一条改进：按**目录**聚类会把注册总口这种「吸引子目录」
      误判成根因所在。按合同的 `shared_boundaries` 聚类会准得多——本次五份里只有两份的
      共享边界真的重叠。
