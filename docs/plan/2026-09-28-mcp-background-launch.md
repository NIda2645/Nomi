# MCP 后台启动与被动发现修复计划

## 范围
- 让 `initialize`、`tools/list`、`resources/list`、`resources/templates/list`、`ping` 在没有活动 Nomi 实例时只读返回，不冷启动 GUI。
- 让真实工具调用冷启动 Nomi 时使用后台模式；后台窗口不抢焦点，渲染正常运行。
- 用户手动再次启动 Nomi 时显示并聚焦已有后台窗口。
- 后台实例在从未显示窗口、最后一次 MCP RPC 后闲置 10 分钟且无在途 ProductionRun 任务时退出。
- 增加 launcher/protocol/main/lifecycle 回归测试。

## 不动项
- 不改画布、目录、供应商、Agent 面板。
- 不改变已显示过窗口的普通实例退出行为。
- 不新增第二份 ProductionRun 在途判据；闲置模块只消费现有 owner 的只读状态。

## 回滚
删除后台环境标志、被动探测接口、后台窗口选项和闲置模块接线，恢复 `resources/list` 直接 invoke 的旧路径；测试与文档随同回滚。

## 验收门
- 被动发现无活动实例不 spawn；活动实例可探测并返回技能资源。
- 工具冷启动 spawn 环境带 `NOMI_LAUNCH_BACKGROUND=1`。
- 后台建窗 `show:false`、不抢焦点、`backgroundThrottling:false`；second-instance 显示并聚焦。
- 未显示后台实例：有在途任务不退；无在途任务闲置 10 分钟退出；窗口显示过后不触发该退出。
- Windows 真机走查：连接 MCP → 列资源不弹窗 → 调工具后台完成不弹窗 → 手动双击显示并看到结果 → 闲置 10 分钟退出。
