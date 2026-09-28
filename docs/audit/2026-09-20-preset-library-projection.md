# src/workbench 库投影的结构复核

状态：评审完成；节点预设修复已实现，待 PR 合入。

## 聚类信号与实查范围

本轮 symptom-cluster 把 09-14 至 09-20 的 20 份合同归入 `src/workbench`。这不是 20 次相同的预设故障；共同风险是各宿主对既有 owner 的数据做局部复制/裁剪，再误当完整能力。本轮复核提示词库→节点→Agent 这条链，不冒充对整个工作台的全新审计。

参考已有 `docs/audit/2026-09-17-ownership-lifetime-census.md` 与 `docs/fixes/2026-09-18-ownership-single-source.root-cause.json`：一个事实有多个私有投影，就会在 owner 改变时漂移。本次 981858b719 的效果筛选把“推荐哪几条”升级成“只能使用哪几条”，并且菜单与 Agent 的 Skill 选择器分别实现，出现数据与体验两类漂移。

## 当前所有权与裁决

| 事实 | 实查 owner / 入口 | 裁决 |
|---|---|---|
| 公开/个人提示词数据 | `src/workbench/api/promptLibraryApi.ts`，两个库 hook | 保留 IPC 数据来源，读失败显式抛错，不能伪装空库；不新建节点私有存储 |
| 精选适用媒介 | `electron/promptLibrary/curatedPrompts.ts:10` / `curation.appliesTo` | 单值 promptType 是库投影，跨媒介精选按原 appliesTo 判断；普通项按 promptType |
| 节点可选集合 | `src/workbench/generationCanvas/nodes/nodePromptPresets.ts` | image/video 收到同一兼容规则；STARTER_EFFECTS 只控制推荐行，不再拥有完整选择列表 |
| 搜索/分组 | `filterPrompts` / `libraryGroups` / `LibraryGroup` | 直接复用双语搜索和分类元数据；搜索命中展开，不产生第二套标题规则 |
| 选择呈现 | `LibraryPicker` ← `V4SkillPopover`、`NodeEffectChips` | 抽出既有 Skill 内容组件，旧节点文字菜单删除；宿主保留执行权 |
| 选中后的写操作 | `NodeGenerationComposer` 的 applyPromptPickerItem | 保留追加、撤销、参考图和持久化；Agent 不走节点写入路径 |

## 反方评审与验证

独立 preset_review 六角色评审拒绝两个快捷方案：只放开过滤仍保留无搜索无预览的菜单；或让画布直接依赖 AI 面板专属组件。采纳公共内容组件与薄宿主，保留各自业务所有权。

门表由 `scripts/door-map.mjs` 实扫，见 `docs/fixes/2026-09-20-node-prompt-presets.root-cause.json`。41 扇门包括 IPC 消费者、共享媒体状态与 Skill/节点的实际宿主；不为减少数字删除合法入口，也不添加额外注册表。三组回归覆盖兼容集合、库读失败与共用选择壳；独立真机任务覆盖公共/个人图片视频、刷新、追加撤销和 Agent 路径。

结论：本次问题可在现有库与显示边界内收敛，不需要新的工作台状态层、供应商特例或第二套 UI 框架。剩余边界：未做付费生成或真实网络故障注入，不能把这轮选择器验收当成生成质量验收。
