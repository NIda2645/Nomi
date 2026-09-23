# T7 参数框稳定性实施报告

状态：**DONE_WITH_CONCERNS / 已实现未推送**。提交身份以外部任务报告为准。分支 `codex/reliability-composer-20260919`，基线 `883f6904b0b0452a41911b8c4df797e73ac0e5aa`。worktree `/Users/aoqimin/Desktop/Nomi-reliability-pi-0919`。preflight clean，依赖复用上一任务 frozen install。

## 根因与最小方案

已读任务书 T7/B14/S30–34/S39/R08、09-10 参数条设计和 placement prior-art、只读审查报告。canvas summary / panel chips 设计保持。初始13门（六个drag写文件）已机器生成，最终门表75门，包括实际owner内部与菜单一跳；v3合同 `docs/fixes/2026-09-19-composer-lifecycle.root-cause.json`。

1. BaseGenerationNode 唯一控制历史，按节点ID/type、单选和结果可用性失效；NodeResultStack删除子层open状态。
2. 原WeakMap改精确stage+唯一Symbol令牌；按下建立生命周期、越过阈值才activate。释放幂等，不再回退到文档第一张stage。各手势取消独立于成功提交：cancel/lostcapture/blur/hidden/readonly/unmount/节点删除关闭临时标志、捕获及待执行RAF；RF还恢复kernel ownership、minimap和membership preview。
3. Composer在history/readonly期间保留实例。readonly关闭可操作子控件及portal，保留prompt editor；共享写入provider使用实时readonly guard。panel blur不再持久化canvas。
4. 既有chunkBoundary仅新增opt-in local recovery，明确重试才创建新lazy资源；默认路由恢复不变。canvas复用NomiSkeleton和错误壳/i18n/token。
5. 既有anchoredPlacement+测量hook修全屏/近全屏节点零可用高度，stage/node ResizeObserver恢复0尺寸；保留翻转、视口/左dock钳制与反缩放，必要时已有卡片滚动。

## R08框架裁决

retain-with-exit：锁定ReactFlow12.11.5 NodeToolbar提供portal/inverse zoom，但没有测量内容后的flip/clamp/控件内部滚动；ViewportPortal坐标语义也不同。保留现有ReactFlow renderer与anchoredPlacement。重新实读安装源码 `node_modules/@xyflow/react/dist/esm/index.js:5013`（portal）、5079–5109（NodeToolbar）、3853（ViewportPortal）。未来出现virtual anchor/auto placement/滚动容器middleware才重新整体评审。未新建overlay/store/reducer，无z-index补丁或定时清零。

## 验证

红：`/tmp/nomi-t7-red-valid.log` 记录lease 5失败、巨型节点几何1失败；`/tmp/nomi-t7-red-chunk.log` 记录局部retry无法恢复，history真实React用例通过。最初尝试jsdom因未安装失败，不把它算行为红；未新增依赖，改用已安装Playwright+Vite的loopback Chromium fixture。

最终绿：`/tmp/nomi-t7-final-green.log`，7文件46测试通过（其中loopback Chromium 12例），应用/electron/pi三套typecheck通过。覆盖token/stage隔离、同源旧release幂等、cancel/lostcapture/blur/readonly/hidden/unmount、wheel takeover、历史失效、lazy pending/error/explicit retry、未发布输入保持、0尺寸恢复及0.4/2倍缩放。

`/tmp/nomi-t7-final-checks.log`：scoped eslint、root-cause、door-map、filesize、test-types、test-waits、canvas-gesture-determinism、i18n、tokens通过。ESLint 0错误，3条基线已有unused警告（已对883f6904b核对）；测试类型native 0错误，既有debt 63（基线76，未抬基线）。UI fixture目录按仓库eslint配置不lint，未把ignored文件算成0警告证据。`git diff --check`通过。所有测试/类型/收尾验证均用with-gates-lock。

证据分层：S30/S31由受控history真实React夹具和装配代码审查支持；S32以共享lease、pan真实DOM及RF writeback/draft测试支持，group/旧resize具体宿主仍缺真实手势走查；S33有Chromium几何/加载证据；S34及S39完整两宿主行为需root实机验收。

## 已交root的S39引用隔离缺口（本次不宣称修复）

现有 `useNodeAssetDrop` 调 `addAssetUrlToNode`，`useNodeMentionSource` 调 `store.connectNodes/updateNode`，绕过panel注入的NodeWriteAccess。root明确要求作为后续单独修复，不能靠禁用功能解决：panel引用须写卡内候选，canvas保留连边语义。

门表：`docs/fixes/2026-09-19-composer-panel-reference-doors.json`。可运行负例：`python3 scripts/with-gates-lock.py --command 'node tests/ux/composer-panel-reference-isolation.red.mjs'`（独立有意红的probe，不在自动*.test套件内）。真实React两个hook放进实际NodeWriteAccessProvider；所有canvas writer仅计数，合成browser store不打开项目、不访问用户数据。实际运行日志 `/tmp/nomi-t7-panel-reference-red.log`：`canvasUpdates=2, canvasConnections=1, cardUpdates=0`，断言明确红在未批准引用写canvas，而非环境/加载故障。

## 证据界限

未付费、未接真实模型/供应商、未打开真实用户项目、未push/merge。没有真实Electron两宿主zh/en截图/输入走查或package证据；root负责这些验收。Chromium夹具与定向测试不能替代它们，也不代表全部panel编辑已经隔离。未运行全量gates/Ponytail（parent负责）。

## 取消语义界限

RF位置draft与membership preview取消时恢复领域投影。旧selection/group/resize路径原本逐帧以persist:false写内存域；本次取消丢弃pending RAF、释放capture/flag、不再发settled/persist，不新增事务式回滚已应用内存位移。此语义已告知root，真实group/旧宿主行为仍须验收，不把清理flag等同于完整位置回滚。
