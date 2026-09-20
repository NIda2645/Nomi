# PR #828：Ponytail 逐条重新处置

原报告针对 `04658ef65c598102a5cb56e7bc09d0d1ea823ee5`，共 26 项。先前统一以冻结版本为由不采纳不充分；本表取代该处置理由。当前为已实现未推送的修复工作树，最终提交与验证收据在交付时补齐，不把旧收据标为当前通过。

这些建议主要是精简，不应与独立审查确认的执行回归、撤销缺陷以及真实资源恢复失败混为一谈。下面的「已改」表示源码已改，不代表全部系统验收完成。

| 项目 | 处置 | 依据与保留的边界 |
| --- | --- | --- |
| E01 laneExtendedDesktopPorts 重复 export 测试 | 已改 | 删除实际停在缺 domain schema 的重复用例；明确 export 的权限失败、两领域零误写仍有独立覆盖。 |
| E02 laneOriginalInput seen 集合 | 已改 | 有效分支祖先且 seq 严格递减已排除循环，保留两项校验。 |
| E03 generationTransportAdapters 错误拼接 | 已改 | 唯一出口 safeFailure 仅消费白名单 code；删除不可见的原始 issues/message 拼接，脱敏不放宽。 |
| E04 batchScheduleDerivation 前缀重复求和 | 已改 | 复用原补偿累加器，按原 committed/price 顺序单遍推进，首个超限仍立即停。 |
| E05 prepareProductionGenerationAuthorization 重复验证 | 不改 | 前校验保护素材解析/上传，后校验保护最终授权；抽函数还需保留各自错误契约。本次没有发现校验错漏，不为减行移动付费边界。 |
| E06 multiShotBatchScheduler 重复 gate 查找 | 已改 | 使用原 currentAnchorCheckpointGate 返回值，waiting 校验完整保留。 |
| E07 productionGenerationSeal prior Map | 不改 | 按序取值只在已经通过身份/顺序检查的输入上等价；改动会影响错误分类和检查先后。现有代码正确，保留未知/重排/重复/候选内容的原子拒绝。 |
| E08 productionGenerationSubmission 无 job 分支 | 已改 | readGenerationExecution 返回必有 job 或抛错，且下一行之前已读 jobId；移除不可达分支。 |
| E09 taskReference union 改 enum object | 不改 | 合法值集合相同，但外发 JSON Schema 从 anyOf 变 enum，Zod 错误结构改变；不属无行为精简。 |
| E10 LaneRestoredDesktopInput 派生类型 | 不改 | extends Omit 会把原可变字段收紧为 readonly，需独立公共类型契约核对；当前未发现字段漂移。 |
| E11 storyboardPlan 改 z.infer | 不改 | 现有双向编译守卫防漂移；整份分镜公共类型、注释及 schema 依赖迁移超出本轮定点接线。 |
| E12 promptMentions 转发函数 | 已改 | 两个公开名称仍保留，各自直接引用同一原投影实现。 |
| E13 storyboardProfiles 手动复制 | 已改 | 使用 structuredClone，返回完整独立模板，未共享可编辑全局对象。 |
| F1 AnchoredPopover 键盘转发包装 | 已改 | Portal 直接接原 consumeEscape，保留 .nokey、文档捕获/冒泡和子层语义说明。 |
| F2 laneClient 删除草稿负向断言 | 不改 | 旧回包不得覆盖新草稿是副作用不变量；当前不访问 store 不能成为删防回归断言的理由。 |
| F3 laneViewModel 临时返回变量 | 已改 | 内联 Map 查询，无时序、次数或语义变化。 |
| F4 asyncReadIdentity 换测试 renderer | 不改 | 需迁移完整 13 条异步时序到 DOM 宿主；现 node 环境无 DOM，机械改 import 不等价。保留覆盖，未声称它是真 UI。 |
| F5 DocumentListSidebar 合并 div/button | 不改 | 会改变 padding 点击区域、gap 和长标题布局；当前不是已证缺陷，本次保持原交互。 |
| F6 storyboardBatchLanding 合并 binding 测试 | 不改 | 一条是 row 无绑定但 context 已有绑定，另一条 row 已有绑定，输入域不同；不能丢前者。 |
| F7 coreCanvasLifecycle 旧 setCanvasDragging 分支 | 已改 | 删除永不执行的旧 API 兼容分支，直接测现役 lease 隔离。 |
| F8 SelectionDrag 未读 origin | 已改 | 删除记录中的未读字段；真正租约捕获的原舞台仍保留。 |
| F9 SelectionDrag 重复 blur/清零 | 已改 | lease 统一接收 blur，删重复监听与清零。后续全量审计发现仅清理会漏结算已应用位移，现原 hook 的 settleDrag 统一正常/中断收尾；固定原项目和图身份，合法目标 flush/emit/commit 一次，过期目标只释放。原入口红6/正控2、修后受控21项通过；zh native-final-v5 与 en native-en-final-v1 已验证原生中断、组移动一次结算、磁盘和冷重开，具体构建见现行验收表。真实设备 pointercancel/lostcapture 及 Windows 不由这些场景证明。 |
| T1 lane-history-compaction 重复动态 import | 已改 | 两个函数使用现有顶层 import，AgentHarness 的独立动态加载保留。 |
| T2 core-a-composer 重复参数编辑 | 已改 | 调用原 editParameter，保留提示词落盘、参数落盘、界面切换与冷重开断言。 |
| T3 core-a-storyboard.paid 重复 report 写入 | 已改 | 删除被 completedResults 完整重建覆盖的两次 push；实际结果、次数、供应商和付费证据断言全保留。此次只复核既有付费产物。 |
| T4 original-storyboard-run 用 toPass 换稳定帧 | 不改 | 某一帧可点击不等于 ResizeObserver 布局连续稳定；保留四帧稳定与所有控件命中断言。 |

本批 16 项已改，10 项按具体等价性、契约或覆盖理由保留。不存在「建议全错」或「全部已修复」结论。最终还须对变化后的分支重新运行 Ponytail，处理新发现，更新具体提交和证据。

2026-09-20 代码复核：逐条对照原 `04658ef65` 的实际 findings 与当前源码差异，16 项确有对应实现，10 项保留理由仍成立。证据 `/private/tmp/nomi-pr828-ponytail-implementation-verification.md` 记录每项源码位置和 36 个涉及文件的完整 blob/patch 身份；这是建议落实核查，不是最终分支模型复审。F9 后续结算修复超出单纯等价删行，已在表中单独说明，不能归入“仅精简无行为影响”。
