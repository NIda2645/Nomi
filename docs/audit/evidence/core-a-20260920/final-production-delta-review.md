# 最终生产增量独立审查

本报告替代早期“HEAD之后7文件18处”的局部审查结论。最终范围为 **origin/main基线至构建冻结树的12文件35个hunk**，涵盖9个生产文件及3个根因合同；每处都记录原行为、当前行为、理由和证据。同池独立代理完成审查，**不是跨模型评审**。

- 基线：`96d368c26c2e5c1f0534861be9b9100630275097`。
- 构建冻结树：`e96a8390eb94bcfb0cc239a180ba587f1face187`；当时HEAD为`15195e2f9e516adfca52f9021f2b170a716d9e3c`，含未提交变更。
- 机器账本：`/private/tmp/nomi-core-a-final-production-reviews-v14.json`，已用`applyReviews`校验；它最终绑定`/private/tmp/nomi-core-a-production-review-inventory-v15/report.json`，文件名v14不是旧树身份。
- 收货时重新逐文件执行`git hash-object`，12个工作树blob均与账本、冻结树中的blob一致。报告本身的后续文档修改不属于该冻结构建树，不能把当前整个工作树也称为同一树。

结论：限定范围35个hunk均已复核，无未关闭的静态发现。该结论可以并入最终差异账本，**不代表授权合并PR**，也不代表其余文件、所有平台或全部用户旅程无缺陷。

## 先前漏检与本次关闭

早期composer外壳`.nokey`仅保护DOM后代，未覆盖挂到body的参数门户；React Portal事件仍沿逻辑树到RF NodeWrapper。原v12测试只证明duration写入和显示，没有检查参数操作是否同时移动节点，不能当这条不变量的证据。补强后的真实Electron v13复现duration 5→6同时节点x925→930。后续同类扫描发现NomiSelect门户的可聚焦供应商按钮有相同风险。

最终只在原InlineParameterBar的inline/portal两根及原NomiSelect.Dropdown增加框架原生`.nokey`，不修改RF按键、位移或选择算法。原AnchoredPopover已具标记，未重复修改。实际门户DOM根拥有输入排除，composer Provider仍通过React上下文提供同一宿主writer；没有新页面、第二编辑正本或生成入口。

原合同的陈旧验证状态已更正。composer合同补齐真实DOM表面owner、同类入口、同步RF分发依赖与升级复验条件。550个门包含已有consumer和原useCombobox唯一宿主的一跳补录，不是新增550个运行入口，也不是提高门岗预算。

## 真实证据与限制

本审查者阅读源码和以下执行日志，没有另行启动GUI或重跑套件：

- `/private/tmp/nomi-portal-keyboard-red.log`保留5个原组件入口红测；`/private/tmp/nomi-portal-keyboard-green.log`为15判据通过。夹具挂真实RF NodeWrapper、原InlineParameterBar和NomiSelect，没有用测试专属`.nokey`替产品修复。四种单/多数值参数×inline/portal组合都证明Arrow只改参数不改节点，随后节点自身Arrow仍移动5px；NomiSelect供应商按钮Arrow不移动节点，Enter实际换家且保选中。
- `/private/tmp/nomi-core-a-composer-final-v14.log`在最终构建下末行`passed`。实际页面参数Arrow前后比较**全部节点位置**保持不变；多选键盘移动、一次真实Undo、磁盘保存及新进程恢复继续通过。此证据补上原v12缺失断言。范围仍为partial CJ4；blur是受控window事件，最后结果清除包含受控store setup，不冒称原生OS失焦或真实UI删除最后结果。
- `/private/tmp/nomi-core-a-paid-verify-final-v14.log`通过，复核已有真实供应商产物和恢复，不新增付费。持久收据见[paid-v14-receipt.json](paid-v14-receipt.json)。该供应商证据不由组件测试推出，也不代表其他供应商/参考组合都验证。
- F15的模型查询、创建返回、persist返回及A→B→A拒绝有原边界测试；原history延迟projection用例日志29项通过。它们分别证明受控边界，不替代完整跨项目GUI旅程。
- Windows、屏幕阅读器设备、全应用lazy失败及全部原生OS中断组合未由本报告证明；候选包与其他矩阵以[现行验收表](../../2026-09-20-core-a-current-acceptance.md)为准。不得用feel自动扫描数直接声称视觉全通过。

可见证据：[中文视频参数条](composer-v14-zh-video.png)、[英文冷恢复视频参数条](composer-v14-en-restored-video.png)。截图存在与主代理亲看记录不替代本报告的源码及行为断言。

## 完整差异逐处判断

以下hunk ID绑定上述冻结inventory，后续完整清点如重排文件只能在patch/hash一致时映射ID，不能凭名字复用结论。所有“正确”均限定当前安装依赖与已核调用者。

### docs/fixes/2026-09-19-composer-lifecycle.root-cause.json

当前Git blob：`a2bde7e5a6ff792fa5e6ff99a4d9a1b4159ccfd6`；完整patch SHA-256：`542e775c868cf9c31d2ff972922a9ddf09e55c5c8ff8f62625111b2aa9a2b887`。

**39.1 — 正确**（归因：not-a-defect）

原行为：基线没有本任务composer根因合同；原drag boolean/history双状态及共享writer旁路缺乏本轮合同。

当前行为：v3合同保原lease/host writer/几何约束；完整登记550门并说明新增为既有consumer补录；加入portal DOM根键盘归属、真实v13红、shared surface owner及回归；付费风险改为paid-v9已验证范围，最终Electron另验。

判断：旧的付费待验文字已准确更正；portal类根因、两个现有共享owner、原生nokey策略和相关scope/test均补齐，不加键盘算法或提高预算。保留最终系统复验未完成的边界。

证据：重读v14完整合同并与v11逐字段比较；550门=after，真实door-map新增33个既有InlineParameterBar/NomiSelect reader；read shared_boundaries、same_class、prevention、regression、residual_risks。portal-keyboard-red为5个真实原组件入口红；green为15判据；没有宣称新Electron已复验。 | 最终useCombobox真实door-map补唯一Mantine owner NomiSelect，定义不计consumer故必须跟进一跳；只doors/door_reduction/recurrence变化，未改变门槛。最终合同48/48日志另由root执行。

### docs/fixes/2026-09-20-original-storyboard-host.root-cause.json

当前Git blob：`20f61356be5f49ac3e799f794cd3ec02c8a788b5`；完整patch SHA-256：`71e4dca2f234a8846c9cde11e5aaab87706d3aefb01dbd7fa768307feabc5992`。

**56.1 — 正确**（归因：not-a-defect）

原行为：基线无本次Run接原分镜编辑器的约束合同；替代页面/runner错误缺乏完整原边界说明。

当前行为：v3合同明确原编辑器/原动作复用、完整editorial保存与CAS、禁止hydrate补节点、保PR808；F15补跨await项目lifetime，门表171。

判断：与原编辑器接线范围一致；170→171明说补录旧rebind入口，非捏造减少；不把纯恢复变成生成，不加前置落画布门。

证据：完整0056.patch JSON审查：171=after，无重复门或不存在路径；核renderer materialize/author projection、applyCanvasToolCall参数及原project issuer；residual_risks明确系统验证独立。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### docs/fixes/2026-09-20-parameter-slider-accessible-name.root-cause.json

当前Git blob：`16832e0c3652f591148c82df430994bb64dd9018`；完整patch SHA-256：`d0c2b6de74e98a589e403c2fe674a9071acda5346198366556a31fd6a889850a`。

**57.1 — 正确**（归因：not-a-defect）

原行为：共享Slider把label给外壳，实际thumb为空；无独立名称合同。

当前行为：新增v3合同绑定唯一Mantine thumbLabel调用，6入口双宿主；residual_risks更正为v12既有判据通过、v13新增位置不变断言揭露portal串键，并引用composer合同及当前验收。

判断：名称与键盘权限现在分开归因，版本事实准确；安装Mantine官方API与6门分类不变，不把命名修复等同portal或跨平台通过。

证据：重读v14完整合同及相对v11仅residual_risks变动；Mantine Slider→Thumb源码、numeric真实组件15判据日志；Windows未验证。

### src/design/NomiSelect.tsx

当前Git blob：`db005ceb264ab8aaf21071c2d3280dce513f4a7d`；完整patch SHA-256：`fe06af98a6f4fd9f3fb79bfe2604cd00dddc25c1543a3567a16122b9e9a63802`。

**229.1 — 正确**（归因：not-a-defect）

原行为：Combobox.Dropdown portal到body；可Tab聚焦的provider chip是BUTTON，Arrow/Enter可沿React逻辑树冒泡到RF NodeWrapper，composer祖先nokey无法命中DOM。

当前行为：唯一原Combobox.Dropdown加className=nokey；搜索/选项/供应商按钮共用该实际DOM根。

判断：复用RF官方isInputDOMNode最近nokey判定，不吞控件自己的键盘，也不干涉其他宿主：canvas外没有RF owner消费该class。保Mantine内置select/Escape/焦点行为，不新造dropdown。

证据：完整origin/main→v14 patch仅这一行；检查Mantine target Arrow处理只preventDefault、Dropdown仅Escape capture；真实NomiSelect body portal provider聚焦后Arrow位置不变，Enter换provider成功且RF选中不丢。portal-keyboard-red含该入口独立红，green15判据。AnchoredPopover原已有nokey，无需再改。

### src/workbench/capability/multiShotCanvasLanding.ts

当前Git blob：`cb298d53a140906694b2f3087bfae48ac7da478b`；完整patch SHA-256：`2a2140a5d5a7a2e177a327069fba4bd50ac9d061282b9417e6abf5fd3806bd5a`。

**276.1 — 正确**（归因：not-a-defect）

原行为：落画布模块只具通用物化依赖，不能核作者正本。

当前行为：引入原project lifetime、Run读取、共享contentToken/plan转换及原projection/binding。

判断：只引入既有owner，未新增可编辑正本或runner。

证据：0275.patch完整；projectCanvasReadSurface issuer、generationPlanEditorial、storyboardProjection被实际调用。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**276.2 — 正确**（归因：not-a-defect）

原行为：所有materialize请求共用可创建路径。

当前行为：载荷增加existingOnly和authorContentToken。

判断：区分作者显式同步和恢复已有节点；字段无新增UI或生成门。

证据：对照electron/productionRun/multiShotCanvasLanding：文稿来源才existingOnly，projectAuthorEdit才token。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**276.3 — 正确**（归因：not-a-defect）

原行为：候选全部可补建/重绑，缺组可新建；函数未锁项目lifetime。

当前行为：先捕获真实项目；existingOnly过滤已绑节点且不重绑/新组；所有同步事务复验lifetime。

判断：保存/重开不复活已删节点；普通明确物化仍可创建；A→B→A不能以同ID复活旧context。

证据：materializeShots.test入口拒绝、rebind模型await项目切换及A→B→A；inLandingTxn围住rebind/group/table/results。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**276.4 — 正确**（归因：not-a-defect）

原行为：用同步withCanvasGestureContext包异步apply，await后上下文已退；创建/重绑后无project复验，组总可建。

当前行为：ctx显式传原apply，注入canWrite/assertTargetCurrent，两个await后复验；existingOnly不建组。

判断：事务只在真实同步写处持有；工具模型await后先guard再同步去重创建，后续不会写新项目。

证据：applyCanvasToolCall:344模型查询→assertTargetCurrent→assertWritable→写inCtx；创建后切项目测试保sentinel；独立dirty报告对应4个hunk复核。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**276.5 — 正确**（归因：not-a-defect）

原行为：fit信号无lifetime保护。

当前行为：通过原inLandingTxn发fit。

判断：旧批次不能在切项目后改变新项目视口意图。

证据：requestCanvasFit仍原owner；此前await返回均复验，fit前再次assertCurrent。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**276.6 — 正确**（归因：not-a-defect）

原行为：persist await期间切项目仍返回旧节点绑定。

当前行为：persist前及返回后复验同context。

判断：拒绝旧结果发布而不改原persist owner；原catch磁盘错误未由此修复，不额外宣称。

证据：materializeShots.test does not publish stale node bindings when project changes during captured persistence。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**276.7 — 正确**（归因：not-a-defect）

原行为：作者保存走通用物化，可能以执行候选覆盖作者/画布覆写。

当前行为：token载荷锁project和Run，读取后复验lifetime及contentToken，复用原projectStoryboardDesign和bindings。

判断：同步作者编辑只更新原绑定节点，原projection保用户覆写且不创建；旧晚回包冲突拒绝。

证据：读取projectStoryboardDesign：只对findShotNode/keyframe结果updateNode，保overriddenShotFields、derived/regenerated保护；Run ID/project/token显式验证。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### src/workbench/generationCanvas/nodes/InlineParameterBar.tsx

当前Git blob：`1a507e56c9142c0c002c50c052b6adc44b1e7da4`；完整patch SHA-256：`5840efb42283421493d02c52bdb6ebe5f8e5b6f3b259ea845a3a9038fe49f752`。

**321.1 — 正确**（归因：not-a-defect）

原行为：renderParameterPanel的inline/portal实际DOM根均无nokey；body portal逃离composer DOM祖先而React仍向NodeWrapper冒泡，slider Arrow同时改duration和移节点。

当前行为：原renderParameterPanel两返回根均加nokey，覆盖body portal、原地inline和调用方slot portal。

判断：隔离跟随实际交互面而非React祖先，使用框架既有排除标记；不改布局/数据写入/参数控件/键名算法，也不把问题藏到RF统一禁键。

证据：完整origin/main→v14 patch仅两class；测试挂真实InlineParameterBar和Mantine在真实RF NodeWrapper，不给fixture添加nokey；明确断言portal/inline DOM位置，单/多参数四路duration5→6、UI6、node位置和ownership不变，随后原node Arrow80→85阳性。五红→15判据绿日志已读；该夹具本身不是Electron实测；最终Electron v14另已通过。

### src/workbench/generationCanvas/nodes/NodeGenerationComposer.tsx

当前Git blob：`7b3fc354fff13b1ed427215549ad616b20b44fa2`；完整patch SHA-256：`bcf13e5b49039d9dfb3c3336f9dc3f5b9a98563e3f435f014352e3e7aec0c7a8`。

**322.1 — 正确**（归因：not-a-defect）

原行为：子控件默认或隐式拿writer。

当前行为：导入已有NodeWriteAccessProvider。

判断：使组件子树使用捕获的宿主写接口；不是新状态正本。

证据：nodeWriteAccess.ts context与canvas默认writer；panel原provider由useAgentPanelSpendConfirm提供。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.2 — 正确**（归因：not-a-defect）

原行为：composer没有显式readOnly入参。

当前行为：可选readOnly默认false。

判断：兼容原可编辑调用，Base可保留只读可见composer。

证据：BaseGenerationNode实际传readOnly；Props变动与下方写守卫配套。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.3 — 正确**（归因：not-a-defect）

原行为：直接解构updateNode，异步后可能仍执行旧可写权限。

当前行为：readOnlyRef包装update；latestNode沿原host；panel移除结构connect权，canvas保留。

判断：更严格底层panel writer仍检查edit-scope身份；外层canWrite只是只读门，latestNode/updateNode不绕过底层失效。

证据：已读useAgentPanelSpendConfirm:231起writer canWrite/requestedNodeId及latestNode；nodeAssetWrite先latestNode；canvas仍复用store。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.4 — 正确**（归因：not-a-defect）

原行为：drop/mention hooks运行在内部Provider创建前，隐式store路径可串写。

当前行为：显式同一writeAccess传drop和mention。

判断：hook调用位置不再决定写目标，素材保原槽位规则。

证据：useNodeAssetDrop before/after await canWrite及project context；nodeAssetWrite显式access无store fallback；panel引用隔离用例。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.5 — 正确**（归因：not-a-defect）

原行为：prompt库回调只检查locked。

当前行为：增readOnlyRef当前值检查。

判断：打开菜单后切只读的晚点击也不能写；保原锁prompt语义。

证据：applyPromptPickerItem入口及原readonly菜单测试，未把locked扩大为全部参数不可改。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.6 — 正确**（归因：not-a-defect）

原行为：prompt库参考图直接读写canvas并立即持久化项目。

当前行为：latestNode/update/addAsset走host access；仅canvas立即persist。

判断：panel草稿中的参考编辑不改画布/触发保存；连续引用基于最新草稿，不只render快照。

证据：nodeAssetWrite以access.latestNode及appendArchetypeArrayValue保持去重/上限；useAgentPanelSpendConfirm原草稿owner。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.7 — 正确**（归因：not-a-defect）

原行为：composer无嵌套writer Provider及RF输入键排除。

当前行为：Provider包完整composer树并加框架nokey；同族body/inline参数面板与NomiSelect门户现由各自原DOM根补nokey。

判断：此hunk为DOM内控件提供必要的宿主权限和框架键盘排除；不会单独保护portal，当前两个原surface owner已闭合同族路径。React context继续跨portal传writer，DOM nokey分别落实际surface，不造新控件。

证据：完整0320.patch；InlineParameterBar:renderParameterPanel/createPortal(body)根无nokey；RF isInputDOMNode查DOM closest；final-composer-paid-v13 x925→930。root在修最早portal边界。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。 | v13 x925→930原失败保留；复核InlineParameterBar两root/NomiSelect.Dropdown三行原生标记，原组件RF fixture五入口红→15判据绿且node Arrow阳性。最终Electron v14随后已通过，详见本报告证据边界。

**322.8 — 正确**（归因：not-a-defect）

原行为：外卡缺原生nowheel/nodrag；readonly仍呈现参考编辑。

当前行为：加原NODE_SCROLL_REGION_CLASS_NAME，保overflow-hidden与内容内滚；readonly状态文案并隐藏参考编辑。

判断：框架原生wheel判定先于React合成stopPropagation；不改固定footer布局，不新造滚动系统。

证据：nodeScrollRegionClassName说明与RF noWheelClassName；完整patch外卡仍overflow-hidden，prompt/reference独立bounded scroll；原smoke已回归。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.9 — 正确**（归因：not-a-defect）

原行为：prompt只按locked可写；blur连panel也保存项目；mention及footer无只读限制。

当前行为：prompt/mention按当前readOnly阻写；panel不blur存项目；readonly隐藏footer。

判断：显示与权限一致；canvas原参数/模型/生成行为仍在可写分支，付款卡编辑仅原草稿owner。

证据：当前PromptEditor/NodeParameterControls入口、writeAccess守卫；parent readonly及双宿主浏览器回归。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.10 — 正确**（归因：not-a-defect）

原行为：footer结束无条件。

当前行为：闭合!readOnly footer条件。

判断：与320.9同一JSX条件，参数panel slot仍保留原宿主落点，无额外控制状态。

证据：逐行0320.patch；末尾JSX及面板挂点完整。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**322.11 — 正确**（归因：not-a-defect）

原行为：根没有Provider闭合。

当前行为：结束当前composer NodeWriteAccessProvider。

判断：权限限定该composer子树，不泄露相邻节点；没有另存数据。

证据：nodeWriteAccess context读取与组件根结构。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### src/workbench/generationCanvas/nodes/controls/ParameterControlBody.tsx

当前Git blob：`d2a404f7a2d029f82c329ff8c82e64c5b0514137`；完整patch SHA-256：`e2ff9bd976b5e54a435eb139086b199070bb2f06dd26f02ff47efa53820698ed`。

**326.1 — 正确**（归因：not-a-defect）

原行为：aria-label命名Slider root，thumb实际slider无名称。

当前行为：使用官方thumbLabel，保值/范围/step/onChange。

判断：单个共享调用点覆盖单/多参数及canvas/panel，框架已有API无需升级/重写控件。

证据：安装Mantine8.3.18 Slider.mjs→Thumb.mjs aria-label；param-panel-numeric names/Arrow/Home/End源码。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### src/workbench/generationCanvas/nodes/useNodeResultHistory.ts

当前Git blob：`0d7dad82428b978bc88cd3466cdd038439d34f0f`；完整patch SHA-256：`2a42e359a1b5ebba7631205ab9cfb1f167ac0439cb5f2eff3ed8551c0895b7e4`。

**334.1 — 正确**（归因：not-a-defect）

原行为：NodeResultStack本地open后effect通知Base第二state；availability判定混UI条件，history容易让composer卡死。

当前行为：新hook为Base唯一history owner，身份/selected/available派生open；functional invalidation仅随生命周期；metadata和stack eligibility集中。

判断：原子派生呈现不等通知effect；NodeResultStack原本的productionMeta函数逐字迁入；延迟RF选择仍接住同次trigger意图，失选/无结果/id-kind变化关闭。

证据：对照origin/main NodeResultStack local open/report effects；Base当前调用与Stack controlled props；composerLifecycle29项含真实延迟projection。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlow.tsx

当前Git blob：`f8234d282b2367904b455b3795f1453e44eb7e9b`；完整patch SHA-256：`5f0aeec194ffe277dd4974ca78c986ffc9a918085fa976f2662f3bde38838a96`。

**335.1 — 正确**（归因：not-a-defect）

原行为：引入按owner字符串setCanvasDragging。

当前行为：改引原beginCanvasDragging及lease类型。

判断：用唯一captured token清理原stage，避免旧cleanup清新手势；无新框架。

证据：canvasDraggingFlag.ts WeakMap stage+symbols/release idempotent；同类producers由同owner处理。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**335.2 — 正确**（归因：not-a-defect）

原行为：只导入pointer drag writeback。

当前行为：同原writeback导入keyboard业务提交。

判断：让RF仍计算位移而业务图接事务；与portal控制排除须联合验。

证据：canvasDragWriteback新函数不含键名/位移计算；当前v13暴露独立portal来源漏门。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**335.3 — 正确**（归因：not-a-defect）

原行为：refs只有dragging/draft/duplicate。

当前行为：增加nativeKeyboardEvent与captured dragLease refs。

判断：瞬态权限不入持久状态，生命周期用DOM dispatch和原lease而非timer。

证据：installedRF同步dispatch；DOM eventPhase结束为0；beginCanvasDragging release永久。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**335.4 — 正确**（归因：not-a-defect）

原行为：所有position一律写drag draft且关闭RF投影，keyboard不进入业务持久化。

当前行为：active drag仍kernel；其余同步keydown非readonly提交，晚pointer恢复flowNodes；callback跟readOnly更新。

判断：保持active drag与同步RF键盘两种权限，不重新计算位移；v13暴露的错误来源已由实际portal DOM根原生nokey排除，而不是在此吞键或回滚正确keyboard提交。readOnly/取消晚事件门保持，独立控制Arrow不移动且原node Arrow仍移动的对照成立。

证据：RF moveSelectedNodes→triggerNodeChanges同步源码；v12多选Undo/冷恢复与blur late-event通过；v13 slider Arrow video位置变化。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。 | v14依赖复验：InlineParameterBar portal/inline单多参数与NomiSelect provider button五条原组件红→绿，保node Arrow阳性；最终Electron v14随后已通过，详见本报告证据边界。

**335.5 — 正确**（归因：not-a-defect）

原行为：drag start bool标记，无集中cancel/unmount/权限变化清理。

当前行为：cancel释放lease、清临时拖动/duplicate/preview、复原kernel；类别/readonly cleanup和节点删除触发；start捕获原lease。

判断：清理不需要写权限；ref指向当前cancel以拿最新投影；只有dragging时清draft，不清用户持久节点。

证据：读完整start/cancel与canvasDraggingFlag原stage token；取消Alt复制保创建副本可Undo，不能误写原节点；真实v12断言。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**335.6 — 正确**（归因：not-a-defect）

原行为：readOnly外没有已取消判断；stop只cancelPreview并靠writeback重新找stage清flag。

当前行为：drag/stop拒绝inactive；stop显式释放captured lease，原事务位置/归属处理保持；移除hostRef传递。

判断：确保取消后late stop不commit；同一个parent拥有lease、helper仅业务完成，避免两处flag owner。

证据：完整onDrag/Stop及commitCanvasNodeDragStop；cancelled writeback测试；原timeline adoption分支未变。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**335.7 — 正确**（归因：not-a-defect）

原行为：stage未记录本次键盘事件。

当前行为：onKeyDownCapture保存nativeEvent，不拦默认或传播。

判断：事件有效期由DOM eventPhase限定；保RF单/多选和Shift语义，不能用此capture代替portal DOM排除。

证据：当前实现无queueMicrotask/timeout；RF NodeWrapper源码与v13事实已分别记录。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### src/workbench/generationCanvas/reactFlow/canvasDragDraft.ts

当前Git blob：`e98e01a21c6556a5aba20af4d4ef19d1ee1eee3f`；完整patch SHA-256：`ccf9f516af0f8f77e7f01873daa964efcf94b3da0d7305572800dcaa0958bea8`。

**338.1 — 正确**（归因：not-a-defect）

原行为：注释声称kernel helper也切hasDefaultNodes。

当前行为：改指drag-start唯一关闭owner。

判断：说明与实际调用者一致，原restore仍stop/cancel重新打开。

证据：0336.patch及handleNodeDragStart setState false，restoreCanvasDragKernelOwnership。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

**338.2 — 正确**（归因：not-a-defect）

原行为：每次kernel position update都强设hasDefaultNodes=false。

当前行为：只写nodeLookup几何。

判断：helper不再窃取整个RF投影ownership；drag-start原先已关，因此不改活跃拖动优化。

证据：参数化canvasDragDraft.test ownsNodes true/false保持；单节点键盘后projection恢复fixture。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

### src/workbench/generationCanvas/reactFlow/canvasDragWriteback.ts

当前Git blob：`13ddfa5a7e7663ed5121b208b97d87d8a12a41b2`；完整patch SHA-256：`700c8c7e21255c81e22775c6b00f427939cb0827762d68f4993ed7efa41349c7`。

**340.1 — 正确**（归因：not-a-defect）

原行为：writeback持有hostRef并重新按字符串清stage；readonly早退残留draft；无键盘业务持久入口。

当前行为：移除旧flag/host依赖；先终止dragging并清无权draft；新增一次history/一批同txn事件/一次persist的keyboard提交。

判断：拖动临时权限由parent lease管理；keyboard helper拒绝无权前不读store、不计算移动；原moveNode emit/persist抑制避免多节点多Undo。门户来源问题归333.4联动审查。

证据：完整0338.patch；store moveNode、canvasEventEmitter同步undo journal；真实v12多选Arrow/一次Undo/磁盘新进程，取消单测只证明pointer helper，未冒称新helper单测。 | v14完整baseline patch与v11的baseBlob/currentBlob/patchSha256一致，header一致，仅映射新id；依赖portal边界已重新核读，未凭dirty差异替代。

