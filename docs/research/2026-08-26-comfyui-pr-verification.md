# ComfyUI 用户反馈系列：PR 验收汇总

状态：最终实现、全仓门禁与三条生产 Electron 任务验收通过。本报告随任务分支提交；用户已授权自行提交 PR，不合并、不发版。

工作树：`Nomi-comfyui-workflow-matrix`，分支 `codex/comfyui-workflow-matrix-20260825`。此前各阶段报告为历史证据，以本汇总的最终结果为准。

## 修复范围

| 用户任务 | 修复边界 |
| --- | --- |
| 导入多参考图工作流并让每张图进正确节点 | 导入声明、参数键去重、画布独立槽位、连线持久化/重放、请求按 key 投影 |
| 视频工作流显示并返回视频 | 从实际输出节点派生；CreateVideo 定位保存节点；旧目录合同保守且原子地迁移 |
| 选择很长的模型文件名 | 长枚举搜索下拉、键盘/焦点、短枚举保留分段、完整值送入请求 |
| 大工作流用滚轮定位和编辑 | 光标锚点缩放、30–200% 边界、菜单/列表独立滚动、靠边菜单可达、保存及冷启动 |
| Mac 触控板操作 | 与生成画布共用现有设置：两指平移、Shift 横移、Meta/Ctrl 缩放、捏合等价事件、实时切档与重启保留 |

不新增模型专用 UI，不增加依赖，不改变默认鼠标档，不按操作系统猜测输入设备。

## 提交前真实任务发现的遗漏

旧的“声明三个槽”单测只证明三个控件存在。新增生产 Electron 任务进一步证实：选第一张图会把三个槽都填成同一张，第二槽无法再添加；实际只有一条边。根因在画布按 reference 类别读写，没有独立参数身份。该失败保留为三图走查的 RED 证据，不把此前合同层通过当成闭环通过。

另外两项独立审查反例已修复并复核通过：

- 图片与文本参数重名：共享 `request.params` 去重空间，默认值/模板不再互相覆盖。
- CreateVideo 迁移的自定义执行目标未包含 saver：模型、绑定与映射整项保留；标准旧目标才自动升级，最终核对实际启用映射的完整图及执行目标。

这两项独立复核：12 文件 / 212 项通过，原始内存反例重新运行已关闭。

最终跨层复审又补齐以下边界，均先复现失败、修复后重新验证：

- 旧 `first_frame` 边兼容通用 `image_url`；视频来源先抽帧，最终图片键收到 PNG，同源视频键仍保留 MP4。
- 编组来源只删除/上传替换一个槽时保留其他槽及 ID；撤销、重放一致，线菜单仍可整组断开。
- 模型目录改变媒体类型时，仅清理确定属于旧上传的镜像值，不残留旧图片或误删独立输入。
- 两段视频倒序接入，或第一槽尚未就绪时，最终模板仍按声明 key 投递，不能被聚合数组覆盖；显式 null 保留空槽，默认空串继续兼容旧 camelCase 输入。
- 真实反向拖线发现视频端口被 resize zone 遮挡；修复层级后，连线建立且节点位置/大小不变。

独立复审已关闭全部实证阻断；最后的旧首帧接力 2 文件 / 7 项、请求投影及 WAN/LTX 4 文件 / 119 项独立复跑通过。

## 验证矩阵

| 维度 | 当前证据 |
| --- | --- |
| 工作流合同 | 文本、单图、首尾帧、三图、图/视频、视频处理、内嵌 prompt、子图 ID、API/UI 导出、不支持输出；纳入最终全仓回归 |
| 参数与迁移边界 | 添加顺序、手动改 key、旧角色、规范化幂等、相同模型多映射、自定义媒体路径、disabled、空/非法/自定义 targets |
| Mac 独立单测复核 | 6 文件 / 57 项通过；共享模块本体与迁移前一致，所有消费者同源，旧模块删除 |
| 生产 Electron 设置任务 | 最终 gates 的同一构建：`comfy-workflow-feedback.walk.mjs` exit 0；5/48/80 节点、鼠标/Mac 事件、两个画布、深浅主题、菜单/字段、保存/冷启动、视频分类和长枚举，以及实际 HTTP 请求完整值 |
| 生产 Electron 三图任务 | `comfy-workflow-multiref.walk.mjs` exit 0：真实 JSON 导入、独立槽连线、同图双槽、局部删除/替换、直接拖线不缩放节点、冷启动及三份不同字节到三个 LoadImage，返回视频实际解码播放 |
| 生产 Electron 图/视频混合任务 | 同脚本 `--with-video` exit 0：三个图片槽与一个视频槽独立，LoadImage #1/#2/#3 与 LoadVideo #8 一一匹配；视频封面、冷启动和结果播放器验证通过，结果 URL 不得等于输入视频 URL |
| 工程门禁 | 最终 `pnpm run gates` exit 0：762 文件通过 / 1 跳过，6,716 测试通过 / 1 跳过；双端类型与测试类型门岗、生产构建及全部结构门禁通过；lint 0 errors / 97 既有 warnings（预算 98），secrets 扫描 3,762 文件通过；走查质量棘轮 15→9，未放宽基线 |

## 复跑

```sh
pnpm run gates
node tests/ux/comfy-workflow-feedback.walk.mjs
node tests/ux/comfy-workflow-multiref.walk.mjs
node tests/ux/comfy-workflow-multiref.walk.mjs --with-video
```

两个 UI 脚本使用正式生产构建与统一隔离启动器，资料、设置、项目、合成图/视频和 HTTP 服务均位于独立临时目录。流程在真实界面中执行；不会通过运行时 store 注入跳过用户动作。

## 最终证据（本机保留）

- 全门日志：`/tmp/nomi-comfy-pr-final-gates.log`。
- 三图：`/tmp/nomi-comfy-pr-multiref.log`；截图目录 `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-multiref-oWsyuH/shots/`。
- 三图加视频：`/tmp/nomi-comfy-pr-mixed-media.log`；截图目录 `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-multiref-P6mGWM/shots/`。
- 设置/鼠标/Mac：`/tmp/nomi-comfy-pr-feedback.log`；截图目录 `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-pbecG4/shots/`。

已亲眼检查最终构建的三图导入、独立连线与结果、混合媒体连线与结果、视频分类、深浅长文件名下拉、200% 底边菜单、80 节点长菜单、Mac 共用设置文案和浅色冷启动截图。布局沿用已确认界面；长值无堆叠，菜单最后项可达，图片和视频槽可区分。

此前失败包括真实槽位广播、连接端口被 resize zone 遮挡，以及测试读取旧 manifest、误把参考封面当 video 标签等；已分别归因并修复。最终三个任务均为干净重跑，不以失败运行的局部通过冒充完整通过。

## 证明范围与限制

- HTTP 服务器是可核对请求和上传字节的模拟服务。输出视频为本地合成夹具；测试验证下载、解码与回显，不代表 GPU 推理。
- 本轮再次只读探测 `127.0.0.1:8188/system_stats`，仍为连接拒绝；没有真实 H3 JSON、节点环境或可用 GPU 服务，未验证用户私有 H3 推理。
- Mac 验证为当前 macOS Electron 上的自动化滚轮/键盘与捏合等价事件，不声称实体触控板手感或帧率已经实测。
- 不是“所有社区工作流永远兼容”的保证；不支持的输出或无法证明安全的旧自定义合同仍明确保留边界。
- 无私有素材/JSON 上传，无远端推理额度消耗；PR 提交不等于合并、发版或已安装到用户机器。

相关计划：[Mac 手势与交付](../plan/2026-08-26-comfyui-mac-gestures.md)、[独立槽位身份](../plan/2026-08-26-comfyui-canvas-slot-identity.md)。
