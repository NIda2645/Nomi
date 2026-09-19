# 本轮改动逐文件清单

生成口径：两个已合入PR的首父diff + 基线23348b6e1至最终工作树（含审计新增文件），按路径去重。正文生产hunk详见同目录四份change-by-change报告。

| 文件 | 来源 | 变更理由、旧行为与验证裁决 |
|---|---|---|
| `AGENTS.md` | 竞品流程 #823 | 从CLAUDE生成，仅新增三日竞品流程入口，未手改工程纪律。 |
| `CLAUDE.md` | 竞品流程 #823 | 在原模型/论文雷达外加入竞品规程；用户只建流程时不执行研究，不扩大发布授权。 |
| `agent-skills/nomi-competitive-radar/SKILL.md` | 竞品流程 #823 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `agent-skills/nomi-competitive-radar/references/protocol.md` | 竞品流程 #823 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `docs/README.md` | 竞品流程 #823 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `docs/audit/2026-09-20-agent-workflow-change-by-change-review.md` | 媒体/编号及审计修复 | 审计记录：追溯共享owner、旧/新差别与已确认回归；冻结结论和后续修正分开，最终状态以总报告为准。 |
| `docs/audit/2026-09-20-canvas-media-geometry.md` | 媒体/编号及审计修复 | 审计记录：追溯共享owner、旧/新差别与已确认回归；冻结结论和后续修正分开，最终状态以总报告为准。 |
| `docs/audit/2026-09-20-preset-library-projection.md` | 预设 #824 | 审计记录：追溯共享owner、旧/新差别与已确认回归；冻结结论和后续修正分开，最终状态以总报告为准。 |
| `docs/audit/2026-09-20-presets-change-by-change-review.md` | 媒体/编号及审计修复 | 审计记录：追溯共享owner、旧/新差别与已确认回归；冻结结论和后续修正分开，最终状态以总报告为准。 |
| `docs/audit/2026-09-20-shot-number-identity.md` | 媒体/编号及审计修复 | 审计记录：追溯共享owner、旧/新差别与已确认回归；冻结结论和后续修正分开，最终状态以总报告为准。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/README.md` | 预设 #824 | 验收索引记录真实操作、截图和工具指标；明确付费provider/LLM未实跑，避免证据外推。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/after-agent-skill-shared-picker.png` | 预设 #824 | 新增预设真实截图证据（before或after、语言/主题/宿主按文件名）；无运行时行为，历史图不冒充当前构建。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/after-effect-media-preview.png` | 预设 #824 | 新增预设真实截图证据（before或after、语言/主题/宿主按文件名）；无运行时行为，历史图不冒充当前构建。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/after-en-dark.png` | 预设 #824 | 新增预设真实截图证据（before或after、语言/主题/宿主按文件名）；无运行时行为，历史图不冒充当前构建。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/after-personal-refresh-zh-light.png` | 预设 #824 | 新增预设真实截图证据（before或after、语言/主题/宿主按文件名）；无运行时行为，历史图不冒充当前构建。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/before-zh-light.png` | 预设 #824 | 新增预设真实截图证据（before或after、语言/主题/宿主按文件名）；无运行时行为，历史图不冒充当前构建。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/journey.json` | 预设 #824 | 新增预设历史真实走查结构化证据；保留当时日期，不当成最终修复版本验收。 |
| `docs/design/verification/2026-09-20-node-prompt-presets/supplemental.json` | 预设 #824 | 新增预设历史追加证据；与截图相互核对，不证明所有网络缩略图解码成功。 |
| `docs/design/verification/2026-09-20-shot-identity/README.md` | 媒体/编号及审计修复 | 验收索引记录真实操作、截图和工具指标；明确付费provider/LLM未实跑，避免证据外推。 |
| `docs/fixes/2026-09-20-anchored-popover-escape.root-cause.json` | 媒体/编号及审计修复 | 新增/更新对应问题v3根因合同：共享不变量、机器门表、同类入口、先红后绿测试；不能凭文档替代实际执行。 |
| `docs/fixes/2026-09-20-canvas-image-aspect.root-cause.json` | 媒体/编号及审计修复 | 新增/更新对应问题v3根因合同：共享不变量、机器门表、同类入口、先红后绿测试；不能凭文档替代实际执行。 |
| `docs/fixes/2026-09-20-node-prompt-presets.root-cause.json` | 预设 #824 | 新增/更新对应问题v3根因合同：共享不变量、机器门表、同类入口、先红后绿测试；不能凭文档替代实际执行。 |
| `docs/fixes/2026-09-20-shot-number-identity.root-cause.json` | 媒体/编号及审计修复 | 新增/更新对应问题v3根因合同：共享不变量、机器门表、同类入口、先红后绿测试；不能凭文档替代实际执行。 |
| `docs/plan/2026-09-19-competitive-learning-workflow.md` | 竞品流程 #823 | 新增实施范围/旧行为理由/复用方案/风险与验收；不是额外产品功能或已完成证明。 |
| `docs/plan/2026-09-20-anchored-popover-escape.md` | 媒体/编号及审计修复 | 新增实施范围/旧行为理由/复用方案/风险与验收；不是额外产品功能或已完成证明。 |
| `docs/plan/2026-09-20-canvas-image-aspect.md` | 媒体/编号及审计修复 | 新增实施范围/旧行为理由/复用方案/风险与验收；不是额外产品功能或已完成证明。 |
| `docs/plan/2026-09-20-node-prompt-presets.md` | 预设 #824 | 新增实施范围/旧行为理由/复用方案/风险与验收；不是额外产品功能或已完成证明。 |
| `docs/plan/2026-09-20-shot-number-identity.md` | 媒体/编号及审计修复 | 新增实施范围/旧行为理由/复用方案/风险与验收；不是额外产品功能或已完成证明。 |
| `docs/research/competitive/README.md` | 竞品流程 #823 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `docs/research/competitive/TEMPLATE.md` | 竞品流程 #823 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `docs/research/competitive/VALIDATION.md` | 竞品流程 #823、媒体/编号及审计修复 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `docs/research/competitive/sources.md` | 竞品流程 #823 | 竞品流程/来源/模板/索引，逐文件理由见Agent与流程报告；只有规则落地，首次定时研究未验证。 |
| `docs/roadmap/TODO.md` | 竞品流程 #823、媒体/编号及审计修复 | 保留旧任务，新增竞品/镜号及修复证据；媒体和镜号合入前仍todo，未提前标done。 |
| `electron/capabilityCore/canvasGraph.test.ts` | 媒体/编号及审计修复 | 新增headless旧图重号/非法号修复，保留原图操作断言；证明主进程也走共享owner。 |
| `electron/capabilityCore/canvasGraph.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `electron/capabilityCore/core.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `electron/capabilityCore/gatewayCanvasReadDoc.test.ts` | 媒体/编号及审计修复 | 既有raw RMW快照新增应有镜号期望，私密字段完整保留断言未删除；raw文档与公开投影仍分开。 |
| `electron/capabilityCore/nodeKindDomain.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `electron/capabilityCore/shotOrder.test.ts` | 媒体/编号及审计修复 | 保留headless原前镜行为，新增配对首帧/参考卡/缺号规则；renderer复用相同owner。 |
| `electron/capabilityCore/shotOrder.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `electron/shared/agentCapabilities/canvasRead.test.ts` | 媒体/编号及审计修复 | 新增共享角色/owner读契约与紧凑文本断言；原限长/结果身份/字段白名单断言保留。 |
| `electron/shared/agentCapabilities/canvasRead.ts` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `electron/shared/agentCapabilities/canvasReadCompact.ts` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `electron/shared/agentCapabilities/canvasReadShotIdentity.test.ts` | 媒体/编号及审计修复 | 新测真实projector与schema：配对、孤立、多归属、参考卡、隐私；审计加精确categoryId红绿回归。 |
| `electron/shared/agentCapabilities/verbs/draftShotsProjection.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `electron/shared/canvas/shotNumbering.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `electron/shared/canvas/shotOrder.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `scripts/boundary-owners-ledger.json` | 媒体/编号及审计修复 | 旧不可变根因合同锚点从Base内联尺寸函数迁到共享measurement hook；禁save/event/undo不变量未改变。 |
| `src/design/AnchoredPopover.tsx` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/i18n/locales/generationCommon.ts` | 预设 #824、媒体/编号及审计修复 | 仅增加/调整zh/en预设名称及镜头角色词；已有key与默认语言保留，详预设/Agent报告。 |
| `src/i18n/locales/libraries.ts` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `src/workbench/ai/v4/AgentPanelV4Composer.tsx` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `src/workbench/api/promptLibraryApi.test.ts` | 预设 #824 | 旧失败返回空数组断言改为拒绝：有意纠正错误语义；保留失败/缺数据/个人库三类，详预设报告。 |
| `src/workbench/api/promptLibraryApi.ts` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `src/workbench/generationCanvas/agent/applyCanvasToolCall.test.ts` | 媒体/编号及审计修复 | 首帧不再存第二份号，新增读投影仍共号断言；没有仅把旧期望改undefined而丢用户行为验收。 |
| `src/workbench/generationCanvas/agent/applyCanvasToolCall.ts` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `src/workbench/generationCanvas/agent/gatherShotVerifyInputs.test.ts` | 媒体/编号及审计修复 | 连续性从裸index-1改复用前镜判据；新增跳号、首帧、参考卡，与有意统一语义对应。 |
| `src/workbench/generationCanvas/agent/gatherShotVerifyInputs.ts` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `src/workbench/generationCanvas/components/LightweightGenerationNode.tsx` | 媒体/编号及审计修复 | 此文件两类变更分别核对：媒体测量/比例见媒体报告；full/LOD身份标签见Agent报告，未混为纯样式改动。 |
| `src/workbench/generationCanvas/components/batchPlanPreview.test.ts` | 媒体/编号及审计修复 | 新增成功首帧参与审片、参考卡排除；原项目生命周期和生成成功保护保留。 |
| `src/workbench/generationCanvas/components/batchPlanPreview.ts` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `src/workbench/generationCanvas/events/canvasEventReducer.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/events/canvasUndoJournal.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/events/shotNumberingLegacyReplay.test.ts` | 媒体/编号及审计修复 | 审计新增真实旧事件序列：交换编号、先无号后占号、tail、undo；阻止每事件校正破坏旧最终态。 |
| `src/workbench/generationCanvas/hooks/useNodeRelationships.ts` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `src/workbench/generationCanvas/hooks/useShotIdentity.test.ts` | 媒体/编号及审计修复 | 新测UI/LOD共享关系、边断开、字段未变对象引用稳定；避免拖动引发全标签重绘。 |
| `src/workbench/generationCanvas/model/shotNumbering.test.ts` | 媒体/编号及审计修复 | 扩展模板/复制/恢复/非法与冲突号、首帧关系；审计新增重复id幂等与安全整数边界，恢复测试改走真实replay入口。 |
| `src/workbench/generationCanvas/model/shotNumbering.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx` | 媒体/编号及审计修复 | 此文件两类变更分别核对：媒体测量/比例见媒体报告；full/LOD身份标签见Agent报告，未混为纯样式改动。 |
| `src/workbench/generationCanvas/nodes/ConvertShotToVideoButton.test.ts` | 媒体/编号及审计修复 | 新增已有overlay的中文/英文共号角色DOM断言；真实双语截图另证布局。 |
| `src/workbench/generationCanvas/nodes/ConvertShotToVideoButton.tsx` | 媒体/编号及审计修复 | 生产逐hunk见Agent报告：沿现有读取/标签/审片链路共享镜头身份；不改变nodeId工具执行和权限。 |
| `src/workbench/generationCanvas/nodes/NodeEffectChips.tsx` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `src/workbench/generationCanvas/nodes/computeMediaMetaPatch.test.ts` | 媒体/编号及审计修复 | 删除尺寸重写旧契约，改验证纯metadata写入和真实比例派生；旧duration覆盖保留，详媒体报告。 |
| `src/workbench/generationCanvas/nodes/nodePromptPresets.test.ts` | 预设 #824 | 新增完整公共/个人兼容集合、双适用效果、搜索与audio排除；可捕获原effect-only缺陷。 |
| `src/workbench/generationCanvas/nodes/nodePromptPresets.ts` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `src/workbench/generationCanvas/nodes/nodeSizing.ts` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/workbench/generationCanvas/nodes/nodeSizing.visualSize.test.ts` | 媒体/编号及审计修复 | 原用例保留，新增横竖极端图、旧高度、video、asset split、footer与无效尺寸。 |
| `src/workbench/generationCanvas/nodes/render/CharacterCardNode.tsx` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/workbench/generationCanvas/nodes/render/PropCardNode.tsx` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/workbench/generationCanvas/nodes/render/SceneCardNode.tsx` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/workbench/generationCanvas/nodes/useNodeMediaMeasurement.test.ts` | 媒体/编号及审计修复 | 新增结果替换/视频poster/footer/特殊节点；审计加实际src身份，原图/缩略图/旧DOM先红后绿。 |
| `src/workbench/generationCanvas/nodes/useNodeMediaMeasurement.ts` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlowNodes.tsx` | 媒体/编号及审计修复 | 生产各hunk旧布局/事件用途、变更理由和边界裁决见媒体报告；Escape后续审计修正见总报告。 |
| `src/workbench/generationCanvas/store/canvasGraphActions.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/store/canvasNodeActions.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/store/canvasSnapshotNormalizer.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/store/generationCanvasStore.ts` | 媒体/编号及审计修复 | 生产逐hunk见编号报告：旧分配/复制/恢复用途与新共享owner逐项对照；旧日志恢复回归已单列修复，未另造事件系统。 |
| `src/workbench/generationCanvas/store/shotNumberingReplay.test.ts` | 媒体/编号及审计修复 | 新测live身份变更与事件JSON/replay/undo一致；常规prompt保留紧凑事件，批量换号用既有快照事件。 |
| `src/workbench/library/LibraryPicker.test.ts` | 预设 #824 | 新增共享选择器结构/空态/图标SSR验证；不能单独证明点击，另有真实浏览器选择与管理验证。 |
| `src/workbench/library/LibraryPicker.tsx` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `src/workbench/skillLibrary/SkillMedia.tsx` | 预设 #824 | 生产修改逐段旧/新、数据安全与保留行为见预设报告；共享选择壳不搬宿主业务。 |
| `tests/ux/_composerFixedFooter.mjs` | 媒体/编号及审计修复 | 保留原验收，再加Escape后菜单关闭、节点选中和composer仍可见。 |
| `tests/ux/_feel.browser.mjs` | 媒体/编号及审计修复 | 新增真实React Flow与popover矩阵；审计补子控件React/native消费Escape，不把dispatch前prevented当等价覆盖。 |
| `tests/ux/canvas-image-aspect.walk.mjs` | 媒体/编号及审计修复 | 新增真实Electron+真实素材任务：横竖、resize、video/cards、LOD、重开、zh/en；0付费生成，不冒充provider实跑。 |
| `tests/ux/canvas-shot-identity.walk.mjs` | 媒体/编号及审计修复 | 新增真实复制、拖动、保存重开、双语与MCP read旅程；验证复制frame指向复制video。 |
| `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-done-clean.png` | 媒体/编号及审计修复 | 替换视觉基线：旧圆已是圆，变化为结果卡上下空带消失、盒高缩短；实际前后肉眼比对，未放宽容差。 |
| `tests/ux/design-lab/__baselines__/process-feedback/pf-fx-final-reveal.png` | 媒体/编号及审计修复 | 替换视觉基线：揭示阶段按最终媒体比例缩短盒高，像素化内容及状态保留；静态图不证明动画时序。 |
| `tests/ux/node-prompt-presets.walk.mjs` | 预设 #824 | 新增真实UI创建项目/个人提示词，公共追加撤销、个人刷新、兼容过滤和Agent共用选择器；历史LinuxEscape漏项已补。 |

| `docs/audit/2026-09-20-change-by-change-review.md` | 审计修复 | 新增逐项审计与红绿证据：分别覆盖生产修改、完整文件清单、旧行为与新回归；最终结论以总报告及PR验证为准。 |
| `docs/audit/2026-09-20-change-inventory.md` | 审计修复 | 新增逐项审计与红绿证据：分别覆盖生产修改、完整文件清单、旧行为与新回归；最终结论以总报告及PR验证为准。 |
| `docs/audit/2026-09-20-media-change-by-change-review.md` | 审计修复 | 新增逐项审计与红绿证据：分别覆盖生产修改、完整文件清单、旧行为与新回归；最终结论以总报告及PR验证为准。 |
| `docs/audit/2026-09-20-numbering-change-by-change-review.md` | 审计修复 | 新增逐项审计与红绿证据：分别覆盖生产修改、完整文件清单、旧行为与新回归；最终结论以总报告及PR验证为准。 |
| `docs/audit/2026-09-20-popover-escape-change-by-change-review.md` | 审计修复 | 新增逐项审计与红绿证据：分别覆盖生产修改、完整文件清单、旧行为与新回归；最终结论以总报告及PR验证为准。 |

本机非Git配置另审：`~/.agents/skills/nomi-competitive-radar`符号链接改指稳定主仓；`~/.codex/automations/nomi-competitive-radar/automation.toml`删除临时source fallback，ACTIVE/三日cron与2026-09-22 10:00锚点不变。TOML读回通过；实际调度仍未验证。
