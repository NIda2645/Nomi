# src/workbench 媒体几何结构复核

状态：已合入 main（PR #825，b5cf48bc0）。范围是画布媒体几何及其读写入口，不冒充全工作台新审计。

本轮同层根因合同已超过七日第三份阈值。复查发现同一事实被分别解释：生成反馈把占位宽高当已生成结果几何、完整节点读旧 previewHeight、轻量节点 cover 裁图、React Flow 任意比例拖拉、卡片 flex-1 图像填剩余高度。共同缺口是实际媒体比例未在共享几何层执行。

复用现有 `resolveNodeVisualSize` 作为所有渲染/连线/布局/选择/fitView 尺寸 owner；保留 `computeMediaMetaPatch` 作为尺寸测量纯边界，把调用者收进 `useNodeMediaMeasurement`。既有 `mediaNodeSize` 改为整体等比约束，白板和全景截图同样受益。所有写入沿用 MEDIA_DIMENSION_UPDATE_OPTIONS，不添加持久化字段真源、历史记录或发布协议。

角色/道具 footer 因内容、语言与编辑态变化而测量，只读 footer 的 offsetHeight，不从卡片总高反推，不随缩放改数。场景信息浮层不计入卡高。只读结果身份过期的回调直接拒绝。历史旧尺寸首次 decode 前尚未验证，成功 decode 后统一派生。

独立 aspect_review 提出的视频遗漏、RF 实际 resize 入口、LOD、split asset 和 card 动态 footer 已纳入。原 freeze footprint 仅在未知尺寸的结果交接期保留，不能压过已解码媒体比例。没有引入另一套节点内核/缩放器/媒体服务。
