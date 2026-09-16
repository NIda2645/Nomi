# PR 802 修复验收证据

## 因果对照

1. 原 802：真实 Electron 的 `make_artifact(text)` 在本地存储准入被拒；跨桥后误报 `surface_port_unavailable`。不能从这个错误名反推旧端口。
2. 仅实验性放行存储：节点已持久化但 DOM 隐藏；上游 `adoptUserNodes` 重置 measured，应用投影只有 CSS size。显式 width/height 后原完整旅程通过。
3. 隔离项目在内容哈希目录位置放置普通文件，制造真实落盘失败。旧桥回复 `surface_port_unavailable`；新 DTO 回复安全执行失败，原节点仍在。走查不改业务 handler，不替换文本夹具。
4. 暂停真实文件去重读取，替换 manifest identity 后恢复：byte/native 旧代码仍发布成功；固定完整身份、canonical root 和目录 inode 并在发布前同步验证后，两路拒绝。取消、复用、sidecar 更新与并发后台上传另有边界测试。
5. 长期 session 与动作 port 分离：所有 renderer invocation/adapter 保存 main 签发的不透明会话；实际动作才捕获当前通道。伪造、跨 registry、错误窗口、A→B→A、同 URL reload、显式 close 都有拒绝测试。已发送请求跟随 session 撤销同步取消。

## 本机已完成

- macOS Electron 43.4.1，真实构建；`node tests/ux/resident-composer-receipt-fix.e2e.mjs` 在 A+B 整合后完整通过。文稿→切生成→文本产物可见→真实文件系统失败→拒绝删除→权限拒绝→独立 MCP stdio 写入→待审批 A→B→A→同 URL reload 后继续写→冷启动读回。
- 该旅程 15 次 loopback 模型请求，零图片请求、零付费请求；不直接注入项目最终状态、lane 消息或回执。
- 报告 `.tmp/pi-resident-composer-receipt-fix-development-1789577422041/report.json`；同目录 `01-irreversible-approval-with-reason.png` 与 `03-artifact-and-rejection-en.png`。根代理已亲眼核对中英文真实截图：产物内容、节点把手、审批卡与失败提示可见。
- 上游框架回归直接运行安装版本 `@xyflow/system`：重新投影后保留可见性；真实上游测量重新生成 handles，resize 后连线起点从 `(370,150)` 更新为 `(410,170)`。DOM 布局输入为确定性夹具，不宣称替代浏览器 ResizeObserver 走查。
- 真实 Electron `canvas-three-gestures.walk.mjs` 连续两次通过：拖线、复制、节点宽高缩放、连线端点几何、取消选择仍可见、撤销尺寸与连线。走查按实际菜单类型选择，截图在鼠标释放后拍摄以免截图触发的物理指针事件干扰拖动；没有修改生产坐标逻辑。根代理亲眼核对 `05-resized-connected-node.png` 与 `06-deselected-resized-node.png`。
- 资产、session、IPC、invocation 和框架相关整合批次：33 套件 334 测试通过。三配置生产类型检查和完整构建通过。

## 2026-09-17 代码收口（本机、未推送）

- 截图热键、抽帧发布、切镜落画布、导演台 AI 场景保存与单一签发点结构：红→绿证据与日志路径见 `review-disposition.md`「交互动作的项目签发」。
- 组合整树：`pnpm run typecheck` 三配置通过（`/tmp/nomi-pr802-p1-typecheck.log`）；`check:test-types` src 0 错、存量 68 未增（`/tmp/nomi-pr802-p1-test-types-3.log`）；改动相关 Vitest 38 文件 267 项通过（`/tmp/nomi-pr802-p1-related-green.log`）；真实 node workspace 生命周期 16 项通过（`/tmp/nomi-pr802-p1-lane-workspace.log`）；`lint:ci` 0 error / 78 warning（上限 81）。
- 仅单测与主进程真实磁盘/真实 ffmpeg 校验，**没有**跑 Electron UI 走查；截图热键真实抓屏与切项目旅程留给第二段。

## 2026-09-17 1b：当前项目读取器删除（本机、未推送）

- 后台生成/找回/轮询身份、交互动作签发、子窗口派生、上传绑定必填：红→绿与日志见 `review-disposition.md`「1b」。
- door-map：当前项目读取 `ccbc0e45d` 106 处 → 0（`/tmp/nomi-pr802-p1-1b-current-project-doors-after.json`）；剩余 14 处显示/传输读（`/tmp/nomi-pr802-p1-1b-live-reader-doors.json`）逐条入棘轮。
- `pnpm run typecheck` 三配置通过（`/tmp/nomi-pr802-p1-1b-typecheck.log`）；`check:test-types` src 0 错、存量 68 未增；`lint:ci` 0 error / 79 warning（上限 81，`/tmp/nomi-pr802-p1-1b-lint.log`）；相关 Vitest 872 文件 7595 项通过、1 项为本分支前已红（`/tmp/nomi-pr802-p1-1b-related-green.log`）；`pnpm run gates:contracts` 86 道门仅 `check:asset-evidence` 红，且在 `50223265c` 已红（`/tmp/nomi-pr802-p1-1b-gates-contracts-final.log`）。
- 仍未跑 Electron UI 走查；后台生成轮询中切项目的真实旅程留给第二段。

## 剩余交付门

独立跨池审查、Ponytail、完整 contracts 与风险分档测试、Linux 原失败边界，以及合入真实 main SHA 的 `delivery:verify-merged` 必须完成后才能标记已解决。此前本机通过记录不是合入收据。

## 2026-09-17 第二段：真实 Electron 验收（本机）

- 遗留两红修根因：`timelineTransportAdapters` 由 `8d06c2410` 引入（时间轴写入把 `capability_receipt_unresolved` 降成确定失败），`check:asset-evidence` 由 `ecf3082ea` 引入（转发层挪文件后按文件登记的豁免失效）；两者 `git bisect run` 定位，修法见 `de970f648`、`0028c580f`。
- 重建后 `node tests/ux/resident-composer-receipt-fix.e2e.mjs` 通过：15 次 loopback 文本请求、0 图片、0 付费；报告 `.tmp/pi-resident-composer-receipt-fix-development-1789590679369/report.json`，01/03 截图已亲眼核对。
- `canvas-three-gestures.walk.mjs` 通过一次（`tests/ux/shots/canvas-three-gestures/`，04/05 截图已核对）。
- 新增 `tests/ux/project-switch-background-run.walk.mjs`（真人点击）：A 提交图片生成、loopback 供应商挂住请求时回项目库新建 B → 放行 → 结果写进 A 的盘上副本并本地化为 A 素材，B 画布零节点、目录文件零变化、供应商只收到 1 次请求；回到 A 节点显示图片。截图热键：本机屏幕录制已授权，A 里抓屏原图只落 A；抓屏在途立即切到 B，B 不弹选区、零文件变化（本次抓屏被静默取消，A 也未落图）。loopback、0 付费。截图 `tests/ux/shots/project-switch-background-run/01-04`，已亲眼核对。
