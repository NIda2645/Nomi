## T7. 镜头参数条、历史面板与异常手势

**来源：** M §14；P T7；V12。  
**入口：** `BaseGenerationNode.tsx`、`NodeGenerationComposer.tsx`、`NodeParameterControls.tsx`、`NodeResultStack.tsx`、`useComposerViewportPlacement.ts`、`canvasDraggingFlag.ts`、React Flow nodes/pointer/drag writeback、快捷键路由。

- [ ] 复现记录 selected／primarySelection／multiSelection／readOnly／节点 kind／历史面板／dragging owner／lazy／尺寸，分别证明挂载与可见性根因。不预设一定是 z-index，也不把所有候选当已发生。
- [ ] 单选可编辑生成节点显示一个参数条；多选为批量入口。素材、锁定、缺模型／引用、生成中等按真实能力给只读／禁用／加载原因，不整块静默消失。
- [ ] 参数编辑与结果历史共享受控交互 owner；明确进历史和退出，换节点、移除结果、类型变化、卸载都无残留隐藏；不反复 effect 清用户 prompt。
- [ ] pointerup/cancel/lostcapture、blur、切面、卸载、节点删除、readOnly 变化和滚轮接管均清理原 stage／手势。释放临时状态与提交位置解耦，不能提前 return 跳清理；其他画布／手势不受误伤。
- [ ] lazy 有可见占位和局部恢复；零尺寸转有效尺寸、缩放靠边、遮挡与上下翻转按单一几何 owner 测量。仅在 R08 证明兼容和收益时使用框架现成组件替代现有实现。
- [ ] 画布与付费卡两宿主都验：卡片未确认的局部覆写不提前改作者／画布，不开始生成。共用控件不等于共用未批准写入目标。
- [ ] 检查 DOM、computed visibility、矩形、命中目标和键盘／文字输入，而不是元素存在即通过。保存重开与 T3/T5 邻接验证。

**验收：** S10、S30–S34、S39、R08／J4／旅程 B2、B6、B7 的适用部分。

