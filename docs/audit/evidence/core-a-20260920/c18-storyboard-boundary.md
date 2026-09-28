# C18 分镜数据边界只读核查

日期：2026-09-20。仓库 `/Users/aoqimin/Desktop/Nomi-core-a-0919`。
比较基线：`git merge-base origin/main HEAD` = `96d368c26c2e5c1f0534861be9b9100630275097`；读取当前工作树及其相对该基线 diff。
本报告未运行 GUI、未付费、未修改生产或测试；前一子任务已新增的五个 workspace 拒绝案例保留。

## 结论

1. 当前没有完整 T3 的 `Run.authoring.plan` 或方案迁移状态机。`authoring` 仅 `{title}`；实际新方案作者内容在 `generationPlan.editorial`，旧方案仍在 `payload.storyboardDesignsByDocumentId`。二者是各有明确身份的不同对象，不存在已实施的 A/B 合并映射。
2. 没找到启用的 `inspectStoryboardMigration` / `migrateStoryboardAuthoring` / `storyboardMigration` / `migrationMapping`。B 原文 T3 明说这两种接口及状态是“建议接口，不保证当前仓库已存在”。不能编造一个 `prepared` 属性，然后宣称测了真实半迁移协议。
3. `prepared` 实际命中现有 `productionRunIntentLog.ts` 的 provider intent WAL，以及供应商授权准备，不是分镜迁移。删它或围绕它造方案迁移会误伤原执行。
4. C18 应验现有旧方案、当前新 Run、同项目并存且不相互覆盖、已有严格边界拒绝损坏输入。五项 workspace 版本/身份负例只证明最外层，不能独自关闭 K4/C18。
5. 现有 v2 真项目＋新 Run fixture 可以复用，不需要新增格式或迁移服务。不过当前两个脚本分别覆盖两种来源，尚不证明同项目并存、旧 retired 字段、无 editorial Run 的失败边界。

## 原任务边界

- A 原文 `docs/audit/evidence/core-a-20260920/scope/Nomi_plan_A_core_fixes_2026-09-19.md:188` K4 明确从旧发布兼容数据、新草稿、现有方案分别选夹具；不能带入 T3 专用树的未完成格式/prepared/部分IPC，不能新增旧 B Agent 写门。
- 同文件 `:270` C18：候选包打开旧格式、半迁移、不支持格式夹具；不破坏原数据，不支持明确拒绝。
- 简化方案 `.../Nomi_simplified_A_plus_T7_original_storyboard_plan_2026-09-20.md:110` 明确不先验要求 Run.authoring 全迁移；`:282` 明确 C18 不自动授权新增迁移。
- 为辨别术语，只读了 Downloads 中 B 的 T3 `:181–217`，未把 B 的其他要求加入施工。其建议迁移协议不等于当前生产格式定义。

## 真实格式及 owner（文件位置均在仓库）

| 当前确实存在的形状 | 原读/写入口 | 行为与证据 |
|---|---|---|
| workspace v2 `payload.storyboardDesignsByDocumentId[documentId]: StoryboardDesign[]` | `src/workbench/project/projectRecordSchema.ts:67`；`workbenchProjectSession.ts:21/35`；`workbenchDocumentSlice.ts:262` | 原方案合法 owner，原编辑器无 host 时按捕获的 design/document 写。不是已迁成只读的 T3 B 视图。 |
| retired `payload.storyboardPlans[doc]={plan,committed}` | `projectNormalize.ts:97–132` | 已有兼容读取，转为内存 design，id=`migrated-${documentId}`；不是本轮新增。 |
| retired `payload.storyboardPlan` + `storyboardPlanCommitted` | 同上 | 已有单份旧方案兼容读取，归一到实际文稿。 |
| 上述 retired 与 `storyboardDesignsByDocumentId` 同时存在 | `projectNormalize.ts:100–103`；`projectNormalize.test.ts:41` | 当前 owner 优先；不合并同名内容。该行为是原基线，测试不能反过来要求两个旧字段同时可写。 |
| 新 Run `origin.sourceDocument` + `generationPlan.editorial: StoryboardPlan`；`authoring:{title}` | `electron/productionRun/productionRunTypes.ts:229/359/375`；`productionStoryboardAuthoring.ts:17`；`useStoryboardRunHost.ts:21` | 一套原编辑器；Run 精确 project/document/run/operation/content token 校验。保存 editorial 不重写既有候选/提交合同；对原已绑定节点显式投影。 |
| Run `generationPlan.candidate/shots`，没有 editorial | `electron/shared/storyboard/generationPlanEditorial.ts:36`；`productionRunIpc.ts:217` | 仅根据已知 candidate 做读取投影；不在 read 中写 editorial，不猜节点恢复。引用预览走已有索引，缺引用拒绝。anchor 缺 kind/carrier 时拒绝，不猜。 |
| Run 没有 `origin.sourceDocument` | `useCreationRunPlans.ts:19–23` | 不猜文稿归属，因此不进入某文稿的 Run 列表。仍可存在于原任务系统，不应叫成损坏项目或自动迁移。 |
| 损坏当前旧 design（如 `plan.shots` 非数组） | `projectRecordSchema.ts:67` → `projectNormalize.ts:76` | 严格解析失败，项目加载应明确错误且禁止自动保存坏 payload；真实候选包尚需验。 |
| 损坏 Run editorial（如 shots 非数组）/无 editorial anchor 信息不足 | `generationPlanEditorial.ts:36/90` → `storyboardRunDraftSession.ts:27` → `StoryboardPlanEditor.ts:240` | 应显示原“方案加载失败”及重读按钮，不显示一份猜测的可写方案；只读失败不应改磁盘。 |

基线差异：`projectNormalize.ts`、`projectRecordSchema.ts`、`workbenchProjectSession.ts`、`electron/workspace/legacyProjectMigration.ts` 相对 merge-base 均无 diff。原 retired 字段兼容及项目 root/project.json 迁移不能称为本轮新增 T3。
本轮新增 Run host/editorial 接线明确保留原 `StoryboardPlanEditor`；`StoryboardPlanEditor.ts:77–82` 选择 host.change 或原 setStoryboardPlan，不能据同用一个 JSX 就跳过两种写目标隔离测试。

## 最小候选包验收矩阵（建议实施顺序）

| 编号 | fixture / 真入口 | 必须核实的结果 |
|---|---|---|
| SB1 | 已有历史 v2 真副本，含 `storyboardDesignsByDocumentId`、真实 JPG 和现有绑定 | 现有 packaged 脚本的原方案编辑、完整字段磁盘对账、冷启动、原 JPG 导出；原源全部文件 hash 不变。 |
| SB2 | 同一隔离项目保留 SB1 旧 design，另以原 repository 创建 source-bound Run editorial，故意同标题、不同 prompt/shot identity | 两行都可定位；分别编辑/冷重启，旧 design 保存不改 Run 作者内容，新 Run 保存不改旧 design；不按标题合并，不复制/新增对方的可编辑正本。只比有意义的作者内容和执行事实，别把合法更新的全项目 revision 当串写。 |
| SB3 | 复用原 `projectNormalize.test.ts` 的 retired map 与 single-plan fixture，带有效文稿/真素材 | 原项目卡打开后原编辑器保 prompt/参考/首帧等原字段。打开不发生本轮 Run 创建；显式编辑保存后沿原规范化 owner 持久，重开不丢。若需要临时制造旧格式，只标“原格式夹具”，不声称历史 v1 用户项目。 |
| SB4 | 同一 payload 放当前 design owner＋不同内容 retired map（已有单测的实际并存形状） | 原优先级不变；当前方案保存不回写 retired 旧 owner。不要把这种旧兼容字段并存称为 T3 prepared。 |
| SB5 | 原 repository 建 source-bound candidate-only Run（无 editorial、无 anchor或缺失引用） | 对可完整投影的 shot：打开/切换/重启前 Run journal/snapshot hash 不变，不自动补 editorial；首次显式编辑才写。候选引用/节点/已提交合同保留。 |
| SB6 | SB5 的 anchor role 但无原作者 kind/carrier，或 candidate引用指向不存在的索引资源；另损坏 editorial shots | 原分镜入口显示失败，不能偷偷降为另一份 plan；Run snapshot/events、项目作者内容与画布字节/语义均未写，零 Agent/媒体调用。每个负例独立进程或独立目标，避免旧 error 满足新断言。 |
| SB7 | 当前旧 design 中 plan.shots 设为错误类型，其他项目内容有效 | 原项目库点击项目卡应拒绝加载并有可见错误；源/副本所有已有文件hash不变，无自动空白替换。不要把损坏未知字段随意造为“版本号”或假迁移状态。 |

SB2/5/6 用原 `createGenerationDraft` 建合法初态；损坏字节仅在 fixture setup、有明确记录地修改现存字段以构造故障，不能伪造签名合法的未来协议或编造 T3 mapping。候选包内走真实 UI/IPC；Node repository 只作 setup/只读证据，不能冒充 GUI 操作。
五个已加入 packaged 脚本的 workspace-format 拒绝 fixture（version1/999、两种 partial main、partial backup）是附加防线，不替代 SB1–7。

## 现有测试到底证明什么

### tests/ux/core-a-creation-runs.e2e.mjs

- 当前脚本通过原 UI 新建两文稿各两 Run；Agent 响应是 loopback；校验 sourceDocument、原编辑器外壳、切换精确 Run、prompt 修改保完整作者字段、兄弟不变、保存不创建 jobs。
- 显式放置与查看保持节点 identity；冷启动恢复，原批量取消零媒体；原单镜/批量 loopback 返回真实 JPG，第二次英文冷启动保结果且无新增提交。
- **不能证明**：候选包路径（目前直接 launchNomiApp(options)，没有 packaged 参数）、真实模型能力/花费、历史 design 与 Run 同项目并存、candidate-only Run兼容、坏 editorial/缺引用的 GUI 拒绝、T3 prepared协议。
- 虽输入含 params/keyframe，它只在 GUI 编辑 prompt，不可声称四份方案都真实编辑了参考/模型/首帧。

### tests/ux/core-a-old-project.packaged.mjs

- 基础路径复制实际历史 workspace v2 的全部文件，保原 id/资产路径；打开已有 `storyboardDesignsByDocumentId` 原编辑器，改一镜 prompt，完整方案字段比对，冷进程重开，原 JPG 加原时间轴并导出可 ffprobe 的 MP4；末尾保护原源哈希。
- 新增五个 fixture 从原库“打开已有文件夹”按钮，经原IPC；只替换系统 picker，确认可见错误、仍在库、未注册、所有文件字节不变；冷重启/关闭后再比哈希。
- **尚未执行的脚本不能记绿**。它目前不含 SB2–7；它的“半迁移”证据只指 workspace identity残缺，不能替代 A/B方案半迁移。
- 当前真实v2样本不等于更早 root/project.json 或 retired storyboardPlans 单字段项目。不要为了 C18 顺手扩出新 legacy 迁移实现。

## 必须保留的证据限制

当前没有 T3 实际落盘 prepared/mapping 格式，不能定义有据的 prepared 拒绝夹具。本轮应报告“未引入/未启用完整 T3 迁移协议，经源码与差异核查”；不能报告“完整 T3 半迁移恢复已验证”。
若用户提供另一未完成 T3 树产物，应先获得其真实字段/写入协议及 bytes 再审，而非把额外属性随便塞入当前 Run。
同时，Run repository `validSnapshot` 目前只校验 checksum，`runFromEvent` 只取 object，不做通用未来 schema 版本拒绝；这点原基线已有。故不能从五个 workspace schema负例推论“任何未知Run格式都被拒绝”，当前能具体核验的是原 storyboard schema/引用/目标边界。若实际遇到外国形状内容被当合法编辑并覆盖，属于 K4阻断，要先复现再修原读写边界，不能自动展开 T3。

## 后续授权的测试接线状态

上述只读核查之后，主代理授权加入 SB3/SB4 三案例。现已新增 `tests/ux/core-a-old-storyboard-formats.mjs`（135行），并接在 packaged 主脚本真实v2旅程成功且旧进程关闭之后。每例独立 runtimeWalk 沙箱，复制完整源文件、保项目ID/媒体路径；只在副本 manifest/backup 构造 retired-map、retired-single、owner+conflicting-retired-map。复用主脚本原打开编辑器与画布保留断言，真实编辑→原owner落盘→新PID重开，核 retired 字段不再写、现有Run文件不变、源hash不变，截图/独立report收入总证据目录。原 setter 的编辑行为是 committed=false/status=draft，测试沿用该契约。

仅静态/受控setup核对完成：两脚本 node --check、diff --check通过；实际原 normalizeRecord 对三个完整历史payload构造夹具均得到完整正确原plan、排除冲突旧字段、源hash未改。受控夹具目录 `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-c18-old-storyboard-setup-UNVdg4`。未跑GUI；SB2/5/6/7没有在本次追加中实施。
