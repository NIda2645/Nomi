# 声明式多图输入：画布连线到请求的槽位身份

> 使用 systematic-debugging / test-driven-development / subagent-driven-development。属于原始「多参导入后只能连一张」修复；沿用已有三个槽及素材选择器，不加界面或模型专用分支。

## 实证与根因

真实生产 Electron，`tests/ux/comfy-workflow-multiref.walk.mjs`：粘贴三 LoadImage JSON，分析与导入确实保留三条媒体声明；选择第一槽的画布来源后，三个槽同时变成同一张红图，仅产生一条边。第二槽添加按钮消失，走查 RED。证据 `/tmp/nomi-comfy-multiref-walk.log`，截图已亲眼检查。

- `controls/parameterControlModel.ts:getEdgeSourceForSlot` 只按 reference/first_frame/last_frame 类别找第一条边。
- `NodeParameterControls.tsx:handleSlotAssignment` 替换与删除也只按类别，丢失参数 key。
- `model/graphOps.ts` 与 `events/canvasEventReducer.ts` 去重仅认 source/target/mode。
- `generationReferenceResolver` 只返回聚合参考数组，`catalogTaskActions` 没有逐声明 key 投影。

因此「导入三行」与「实际三路投递」并不等价，修复必须贯穿同一条身份链。

## 最小合同与取舍

| 路线 | 用户效果 | 代价 / 结论 |
| --- | --- | --- |
| 边携带可选 targetParamKey，mode 仍表示参考语义 | 每个槽有独立连线，替换/删除不影响别的槽；同图可用于两槽 | 采用；复用现有边和重放系统 |
| 把 key 编成动态 mode | 可能破坏已有语义菜单、能力校验与所有 mode 枚举消费者 | 不采用 |
| 在 node.meta 写每槽 URL 快照 | 来源换图后可能仍发送旧 URL，边和 meta 两份事实会分裂 | 不采用 |

实现：

1. `GenerationCanvasEdge` 增加可选 `targetParamKey`；schema、graphOps、事件同语义判定与重放保留该字段。不改已有六种 mode。
2. 新建纯粹的声明槽/边分配模块：先占显式 key，再按边的 order 把无 key 的旧边逐一分给匹配的空槽；pending 来源也占位，一条边不广播多槽。旧首尾帧保持组语义。
3. 模型选择、自动同步和执行前目录解析统一投影轻量声明（key/label/group，没有 URL）到节点 meta。切换模型替换声明，当前目录为真源，不让旧声明长期残留。
4. 新裸连线也持久化分到的 key；旧无 key 边在编辑边界补身份，避免删除中间槽导致后续槽顺移。
5. 控件显示、picker 选图、上传、移除与 runner 共用分配结果。只改对应 key 的边/本地值，保留其他槽。
6. resolver 按当前声明输出每 key 的实时来源 URL，catalog 请求将它们写入 flat extras，优先于陈旧本地值；任意模型声明均可用，不判断 ComfyUI/H3 身份。
7. 已有媒体候选区分 image/video，但导入参数控件丢掉了 mediaKind，槽选择器固定收图片。将这份已有事实作为可选 `mediaKind` 贯穿参数共享类型、目录解析、声明分配及 AssetSlot.accept；未声明时仍默认 image，不增加另一种控件类型。匹配视频槽不走首帧抽帧分支。
8. 真实拖线验收发现视频普通端口中心被侧边 resize zone（z=6）覆盖，拖连接点实际改变节点宽度；只将普通连接端口升至 z=7，不变更位置/大小/外观。走查验证从输入端反向拖线后参数边落盘且节点几何完全不变，作为同一连线任务的必要修复。
9. 最终兼容复审：旧 `first_frame` 边可落入通用 `image_url` 参考槽，专用首帧槽优先；显式首帧边的视频来源仍先抽帧，再向对应图片参数投递抽出的图片（不得直接发送 MP4）；普通图片参考仍拒绝视频，显式视频槽不抽帧。编组的单槽编辑只断该边、解除对应编组联动并保留其他槽，线菜单仍整组断开；声明失效只清理能证明属于旧上传的镜像值。
10. 最终请求使用「聚合兜底 < 显式槽值（含 null）< 档案当前模式投影」优先级。倒序连接两个视频、第一槽尚未就绪时，标准 `source_video_url` 不得被聚合数组首项覆盖；默认值中的空串/undefined 不代表清空，继续允许旧 camelCase 调用方填值。此规则覆盖所有已有标准媒体键，不增加 ComfyUI 分支。

## 六视角检查

- CTO：边为引用事实源，不维护每槽 URL 镜像；辅助纯模块复用。
- 产品：解决任意数量的独立输入，不把三张写成上限。
- 设计：沿用已批准槽位与 picker，不加新的配置或技术名词。
- 前端：显示和操作共用分配；模型更新/冷启动不能丢声明。
- 后端：参数 key 与上传文件一一对应；不改变 ComfyUI HTTP 协议。
- 用户：连三图、替换中间一张、移除一张、重启再生成，剩余图不串位。

## 验收

- [x] 先 RED 的纯逻辑/存储/请求测试：三声明、同来源两槽、替换/删除、pending、不按 key 广播、旧无 key 边稳定分配、首尾帧、模型切换与更新、schema/重放/撤销不吞边。
- [x] 真实三图任务：三独立来源入槽→三边落盘→局部删除/替换→冷启动→三份图片字节上传→`/prompt` 的 LoadImage #1/#2/#3 一一匹配→可解码视频回显。
- [x] 同一走查增加 `--with-video` 混合变体：3 图 + 1 视频，视频槽只选视频，LoadVideo #8 收到对应 mp4，图片/视频不串类型。
- [x] 原 Mac/鼠标工作流设置、视频分类/枚举完整走查不回归，亲眼检查深浅截图。
- [x] 独立代码与合同复核、全仓 gates 通过。提交 PR 的动作由 Mac 交付计划 Task 3 跟踪，不合并。

## 范围与回滚

仅生成画布的 model/schema/graphOps、store、events reducer、控件、目录声明投影与 runner，及最终请求的通用参考键投影和对应测试。实现若需要相邻最小共享类型，由代码事实决定并记录，不新建一套画布系统。无真实用户数据、无 GPU/远程额度；模拟返回的视频只证明 UI 与运输链。回滚本修复会让旧客户端忽略新增可选槽键，故不得声称旧版多槽行为正确；不作破坏性数据迁移。
