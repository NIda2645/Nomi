# 画布镜头身份结构复核

状态：已实现未推送。七日同层重复修复的结构复核，范围为镜头身份写入、恢复、投影及 Agent 操作；不宣称其他画布问题已审计。

既有 renderer 编号 owner 与 headless nodeKindDomain 复制了资格/递增规则；模板、粘贴、恢复及读面各自解释裸 shotIndex。现只保留 electron/shared/canvas/shotNumbering.ts 一份纯领域定义，renderer 原模块转导出，headless 删除镜像。

用户选择同镜头首帧图/视频共号，但其 nodeId 仍不同。已有 storyboardKeyframe + first_frame 边是配对真源；不添加配对字段、标题解析或永久计数器。孤立首帧无假号，多owner明确返回id列表。

写与读对偶：普通创建/变体、批量复制、模板、跨分类、旧工程和事件恢复都复用 owner；full/LOD和Agent结构/紧凑文案都复用同一个投影。测量/拖动不分配新身份。Agent通过nodeId执行，角色负责消歧。

独立反方实测发现模板重复、复制旧首帧、默认分类/参考卡漂移；补充发现batch交换号与逐条事件归一不等价，以及分类迁移漏meta。以真实store与event replay测试验证，不以字符串断言代替链路。

既有Zustand存储、React Flow节点身份、事件手势/快照和Agent能力schema继续使用；没有新状态容器、编号服务或并行投影。依赖无需升级。
