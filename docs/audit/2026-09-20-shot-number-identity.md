# 画布镜头身份结构复核

状态：已实现未推送。七日同层重复修复的结构复核，范围为镜头身份写入、恢复、投影及 Agent 操作；不宣称其他画布问题已审计。

既有 renderer 编号 owner 与 headless nodeKindDomain 复制了资格/递增规则；模板、粘贴、恢复及读面各自解释裸 shotIndex。现只保留 electron/shared/canvas/shotNumbering.ts 一份纯领域定义，renderer 原模块转导出，headless 删除镜像。

用户选择同镜头首帧图/视频共号，但其 nodeId 仍不同。已有 storyboardKeyframe + first_frame 边是配对真源；不添加配对字段、标题解析或永久计数器。孤立首帧无假号，多owner明确返回id列表。

写与读对偶：普通创建/变体、批量复制、模板、跨分类、旧工程和事件恢复都复用 owner；full/LOD和Agent结构/紧凑文案都复用同一个投影。测量/拖动不分配新身份。Agent通过nodeId执行，角色负责消歧。

独立反方实测发现模板重复、复制旧首帧、默认分类/参考卡漂移；补充发现batch交换号与逐条事件归一不等价，以及分类迁移漏meta。以真实store与event replay测试验证，不以字符串断言代替链路。

既有Zustand存储、React Flow节点身份、事件手势/快照和Agent能力schema继续使用；没有新状态容器、编号服务或并行投影。依赖无需升级。


## electron/capabilityCore 结构复核

能力核原先在nodeKindDomain镜像资格与max+1，又由shotOrder私读存储镜号；渲染审片另外持有index-1映射。这与本周多份“投影/写入丢语义”合同属于同一边界症状：读写方自己重建领域规则。此次实扫canvasGraph.normalizeSnapshot、nodeKindDomain、core审片、renderer gather与canvas.read；恢复与投影收敛到electron/shared/canvas，前镜判据也移动原实现到shared（旧入口仅转导出），渲染层不导入主进程代码。

对偶核验：disk/renderer gateway都保留raw私有RMW内容同时修复编号；create后read返回同一nodeId+编号+角色；UI与Agent首帧归属相同；live/batch/replay/redo相同。未引入第二个协议或读取服务。其他能力核合同涉及认证/支出/模型调度，其防线保持原owner，本审计只确认此次改动未绕开它们，不宣称整层重新认证。
